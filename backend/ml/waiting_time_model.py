import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction import DictVectorizer


MODEL_VERSION = "wait-rf-1.1.0"
MIN_VALID_ROWS = 50
MIN_TRAINING_ROWS = 40
MIN_PAIR_ROWS = 20
MAX_OBSERVATION_AGE_DAYS = 365
HOLDOUT_FRACTION = 0.2
REQUIRED_COLUMNS = {
    "observation_id",
    "hospital_id",
    "department",
    "arrival_at",
    "service_start_at",
    "time_zone",
    "consent",
    "consent_version",
    "review_status",
    "reviewed_at",
    "source",
}
FEATURE_COLUMNS = ["hospital_id", "department", "weekday", "minute_of_day"]


class DatasetError(ValueError):
    pass


def _parse_timestamp(value, field, time_zone):
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (AttributeError, ValueError) as error:
        raise DatasetError(f"{field} must be an ISO-8601 timestamp.") from error
    if parsed.tzinfo is None:
        raise DatasetError(f"{field} must include a timezone offset.")
    try:
        return parsed.astimezone(ZoneInfo(time_zone))
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise DatasetError("time_zone must be a valid IANA timezone.") from error


def _feature_row(hospital_id, department, arrival_at):
    return {
        "hospital_id": hospital_id,
        "department": department,
        "weekday": arrival_at.weekday(),
        "minute_of_day": arrival_at.hour * 60 + arrival_at.minute,
    }


def load_approved_observations(path, now=None):
    source_path = Path(path)
    raw_bytes = source_path.read_bytes()
    digest = hashlib.sha256(raw_bytes).hexdigest()
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=MAX_OBSERVATION_AGE_DAYS)
    rows = []
    excluded = Counter()
    seen_ids = set()

    with source_path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise DatasetError(
                "Dataset is missing required columns: " + ", ".join(sorted(missing))
            )

        for record in reader:
            observation_id = (record.get("observation_id") or "").strip()
            if not observation_id or observation_id in seen_ids:
                excluded["missing_or_duplicate_id"] += 1
                continue
            seen_ids.add(observation_id)
            if (record.get("consent") or "").strip().lower() not in {
                "true",
                "1",
                "yes",
            }:
                excluded["consent_not_recorded"] += 1
                continue
            if not (record.get("consent_version") or "").strip():
                excluded["consent_version_missing"] += 1
                continue
            if (record.get("review_status") or "").strip() != "approved":
                excluded["not_approved"] += 1
                continue
            if not (record.get("reviewed_at") or "").strip():
                excluded["missing_review_timestamp"] += 1
                continue
            source = (record.get("source") or "").strip()
            if source != "anonymous_patient_report":
                excluded["unsupported_source"] += 1
                continue

            hospital_id = (record.get("hospital_id") or "").strip()
            department = " ".join((record.get("department") or "").split())
            time_zone = (record.get("time_zone") or "").strip()
            if not hospital_id or not department or len(department) > 120:
                excluded["invalid_hospital_or_department"] += 1
                continue

            try:
                arrival_at = _parse_timestamp(
                    record.get("arrival_at"), "arrival_at", time_zone
                )
                service_start_at = _parse_timestamp(
                    record.get("service_start_at"), "service_start_at", time_zone
                )
                reviewed_at = _parse_timestamp(
                    record.get("reviewed_at"), "reviewed_at", time_zone
                )
            except DatasetError:
                excluded["invalid_timestamp_or_timezone"] += 1
                continue

            arrival_utc = arrival_at.astimezone(timezone.utc)
            service_utc = service_start_at.astimezone(timezone.utc)
            wait_minutes = (service_utc - arrival_utc).total_seconds() / 60
            reviewed_utc = reviewed_at.astimezone(timezone.utc)
            if (
                arrival_utc > now
                or service_utc > now
                or reviewed_utc > now
                or reviewed_utc < service_utc
                or wait_minutes < 0
            ):
                excluded["future_or_reversed_timestamps"] += 1
                continue
            if arrival_utc < cutoff:
                excluded["observation_too_old"] += 1
                continue
            if wait_minutes > 1440:
                excluded["wait_exceeds_24_hours"] += 1
                continue

            rows.append(
                {
                    "observation_id": observation_id,
                    "hospital_id": hospital_id,
                    "department": department,
                    "arrival_at": arrival_utc,
                    "features": _feature_row(hospital_id, department, arrival_at),
                    "target": wait_minutes,
                }
            )

    rows.sort(key=lambda row: row["arrival_at"])
    return rows, {
        "sha256": digest,
        "rows_read": sum(excluded.values()) + len(rows),
        "rows_approved_valid": len(rows),
        "rows_excluded": dict(excluded),
    }


def _pipeline():
    return Pipeline(
        [
            ("features", DictVectorizer()),
            (
                "regressor",
                RandomForestRegressor(
                    n_estimators=300,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=1,
                ),
            ),
        ]
    )


def train_model(dataset_path, artifact_path, now=None):
    rows, provenance = load_approved_observations(dataset_path, now=now)
    if len(rows) < MIN_VALID_ROWS:
        raise DatasetError(
            f"At least {MIN_VALID_ROWS} reviewed, consented observations are "
            f"required; found {len(rows)}. No model artifact was written."
        )

    split_index = int(len(rows) * (1 - HOLDOUT_FRACTION))
    if split_index < MIN_TRAINING_ROWS or len(rows) - split_index < 10:
        raise DatasetError("Not enough rows for chronological training and evaluation.")

    training_rows = rows[:split_index]
    test_rows = rows[split_index:]
    features = [row["features"] for row in training_rows]
    targets = [row["target"] for row in training_rows]
    test_features = [row["features"] for row in test_rows]
    test_targets = [row["target"] for row in test_rows]

    model = _pipeline()
    model.fit(features, targets)
    model_predictions = model.predict(test_features)

    grouped_targets = defaultdict(list)
    for row in training_rows:
        grouped_targets[(row["hospital_id"], row["department"])].append(
            row["target"]
        )
    baseline_predictions = [
        statistics.median(
            grouped_targets.get(
                (row["hospital_id"], row["department"]), targets
            )
        )
        for row in test_rows
    ]

    def metrics(actual, predicted):
        return {
            "maeMinutes": round(float(mean_absolute_error(actual, predicted)), 3),
            "rmseMinutes": round(
                math.sqrt(float(mean_squared_error(actual, predicted))), 3
            ),
        }

    model_metrics = metrics(test_targets, model_predictions)
    baseline_metrics = metrics(test_targets, baseline_predictions)
    production_model_selected = model_metrics["maeMinutes"] < baseline_metrics[
        "maeMinutes"
    ]
    absolute_residuals = sorted(
        abs(actual - float(predicted))
        for actual, predicted in zip(test_targets, model_predictions)
    )
    interval_index = min(
        len(absolute_residuals) - 1,
        math.ceil(0.9 * len(absolute_residuals)) - 1,
    )
    test_start = test_rows[0]["arrival_at"]
    test_end = test_rows[-1]["arrival_at"]
    global_median = statistics.median(targets)
    metadata = {
        "modelVersion": MODEL_VERSION,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "datasetSha256": provenance["sha256"],
        "sourceDataset": Path(dataset_path).name,
        "target": "service_start_at - arrival_at, in minutes",
        "featureColumns": FEATURE_COLUMNS,
        "chronologicalSplit": {
            "trainingRows": len(training_rows),
            "testRows": len(test_rows),
            "trainingStart": training_rows[0]["arrival_at"].isoformat(),
            "trainingEnd": training_rows[-1]["arrival_at"].isoformat(),
            "testStart": test_start.isoformat(),
            "testEnd": test_end.isoformat(),
        },
        "trainingRows": len(training_rows),
        "approvedRows": len(rows),
        "sourceDataLatestAt": rows[-1]["arrival_at"].isoformat(),
        "trainingDataLatestAt": training_rows[-1]["arrival_at"].isoformat(),
        "excludedRows": provenance["rows_excluded"],
        "modelMetrics": model_metrics,
        "historicalMedianBaselineMetrics": baseline_metrics,
        "selectedMethod": (
            "random_forest" if production_model_selected else "historical_median"
        ),
        "modelImprovedOverBaseline": production_model_selected,
        "empiricalAbsoluteResidual90thPercentileMinutes": round(
            absolute_residuals[interval_index], 3
        ),
        "pairObservationCounts": {
            f"{hospital_id}|{department}": len(values)
            for (hospital_id, department), values in grouped_targets.items()
        },
        "pairHistoricalMedians": {
            f"{hospital_id}|{department}": statistics.median(values)
            for (hospital_id, department), values in grouped_targets.items()
        },
        "globalHistoricalMedian": global_median,
        "minimumPairObservations": MIN_PAIR_ROWS,
    }
    artifact = Path(artifact_path)
    artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "metadata": metadata}, artifact)
    return metadata


def load_artifact(artifact_path):
    path = Path(artifact_path)
    if not path.is_file():
        return None
    bundle = joblib.load(path)
    if (
        not isinstance(bundle, dict)
        or not isinstance(bundle.get("metadata"), dict)
        or not isinstance(bundle.get("model"), Pipeline)
        or bundle["metadata"].get("modelVersion") != MODEL_VERSION
        or not bundle["metadata"].get("trainingDataLatestAt")
    ):
        raise DatasetError(
            "The model artifact is invalid or incompatible; retrain it from "
            "the currently approved dataset."
        )
    return bundle


def predict_from_artifact(bundle, hospital_id, department, requested_at, time_zone):
    if (
        not isinstance(hospital_id, str)
        or not hospital_id.strip()
        or not isinstance(department, str)
        or not department.strip()
    ):
        raise DatasetError("hospital_id and department are required.")
    requested = _parse_timestamp(requested_at, "requested_at", time_zone)
    if requested.astimezone(timezone.utc) <= datetime.now(timezone.utc):
        raise DatasetError("requested_at must be in the future.")

    if bundle is None:
        return {
            "available": False,
            "predictedWaitMinutes": None,
            "method": "insufficient_data",
            "reason": "No trained model artifact is installed.",
            "modelVersion": None,
            "observationCount": 0,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "dataFreshness": None,
        }

    metadata = bundle["metadata"]
    training_data_latest_at = datetime.fromisoformat(
        metadata["trainingDataLatestAt"]
    ).astimezone(timezone.utc)
    if (
        datetime.now(timezone.utc) - training_data_latest_at
        > timedelta(days=MAX_OBSERVATION_AGE_DAYS)
    ):
        return {
            "available": False,
            "predictedWaitMinutes": None,
            "method": "stale_model",
            "reason": "The model's reviewed observations are more than one year old.",
            "modelVersion": metadata["modelVersion"],
            "observationCount": 0,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "dataFreshness": metadata["trainingDataLatestAt"],
        }
    pair_key = f"{hospital_id}|{department}"
    pair_count = metadata["pairObservationCounts"].get(pair_key, 0)
    if pair_count < MIN_PAIR_ROWS:
        return {
            "available": False,
            "predictedWaitMinutes": None,
            "method": "insufficient_data",
            "reason": (
                f"At least {MIN_PAIR_ROWS} reviewed observations for this "
                "hospital and department are required."
            ),
            "modelVersion": metadata["modelVersion"],
            "observationCount": pair_count,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "dataFreshness": None,
        }

    feature = _feature_row(hospital_id, department, requested)
    if metadata["selectedMethod"] == "random_forest":
        prediction = float(bundle["model"].predict([feature])[0])
        method = "random_forest"
    else:
        prediction = float(metadata["pairHistoricalMedians"][pair_key])
        method = "historical_median_baseline"
    prediction = max(0.0, prediction)
    return {
        "available": True,
        "predictedWaitMinutes": round(prediction),
        "method": method,
        "reason": None,
        "modelVersion": metadata["modelVersion"],
        "observationCount": pair_count,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataFreshness": metadata["trainingDataLatestAt"],
        "empiricalAbsoluteResidual90thPercentileMinutes": metadata[
            "empiricalAbsoluteResidual90thPercentileMinutes"
        ],
    }


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Train and chronologically evaluate a hospital wait-time model."
    )
    parser.add_argument("dataset", help="CSV export of reviewed observations.")
    parser.add_argument(
        "--artifact",
        default=str(Path(__file__).parent / "artifacts" / "wait_model.joblib"),
        help="Output path for the model bundle.",
    )
    parser.add_argument("--report", help="Optional JSON evaluation report path.")
    args = parser.parse_args()
    metadata = train_model(args.dataset, args.artifact)
    report = json.dumps(metadata, indent=2)
    if args.report:
        Path(args.report).write_text(report + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
