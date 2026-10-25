import csv
import math
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib

from waiting_time_model import (
    DatasetError,
    load_approved_observations,
    load_artifact,
    predict_from_artifact,
    train_model,
)


FIELDS = [
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
]


def write_rows(path, count=60):
    start = datetime.now(timezone.utc) - timedelta(days=count + 10)
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        for index in range(count):
            arrival = start + timedelta(days=index)
            wait = 15 + index % 5
            writer.writerow(
                {
                    "observation_id": f"test-{index}",
                    "hospital_id": "hospital-test",
                    "department": "Cardiology",
                    "arrival_at": arrival.isoformat(),
                    "service_start_at": (
                        arrival + timedelta(minutes=wait)
                    ).isoformat(),
                    "time_zone": "UTC",
                    "consent": "true",
                    "consent_version": "wait-observation-v1",
                    "review_status": "approved",
                    "reviewed_at": (arrival + timedelta(hours=1)).isoformat(),
                    "source": "anonymous_patient_report",
                }
            )


class WaitingTimeModelTests(unittest.TestCase):
    def test_training_uses_approved_consented_rows_and_evaluates_chronologically(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "observations.csv"
            artifact = Path(directory) / "model.joblib"
            write_rows(dataset)

            metadata = train_model(dataset, artifact)

            self.assertEqual(metadata["approvedRows"], 60)
            self.assertEqual(metadata["chronologicalSplit"]["trainingRows"], 48)
            self.assertEqual(metadata["chronologicalSplit"]["testRows"], 12)
            self.assertLess(
                datetime.fromisoformat(
                    metadata["chronologicalSplit"]["trainingEnd"]
                ),
                datetime.fromisoformat(
                    metadata["chronologicalSplit"]["testStart"]
                ),
            )
            self.assertEqual(metadata["modelVersion"], "wait-rf-1.1.0")
            self.assertTrue(math.isfinite(metadata["modelMetrics"]["maeMinutes"]))
            self.assertTrue(math.isfinite(metadata["modelMetrics"]["rmseMinutes"]))
            self.assertIn("maeMinutes", metadata["modelMetrics"])
            self.assertIn("rmseMinutes", metadata["modelMetrics"])
            self.assertIn("maeMinutes", metadata["historicalMedianBaselineMetrics"])
            self.assertIn("rmseMinutes", metadata["historicalMedianBaselineMetrics"])
            self.assertEqual(
                metadata["featureColumns"],
                ["hospital_id", "department", "weekday", "minute_of_day"],
            )
            self.assertTrue(artifact.is_file())
            bundle = load_artifact(artifact)
            self.assertEqual(
                bundle["metadata"]["modelVersion"],
                "wait-rf-1.1.0",
            )
            prediction = predict_from_artifact(
                bundle,
                "hospital-test",
                "Cardiology",
                (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
                "UTC",
            )
            self.assertTrue(prediction["available"])
            self.assertGreaterEqual(prediction["observationCount"], 20)
            self.assertEqual(
                prediction["dataFreshness"],
                metadata["trainingDataLatestAt"],
            )

    def test_dataset_requires_the_full_provenance_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "incomplete.csv"
            dataset.write_text("observation_id,hospital_id\n", encoding="utf-8")

            with self.assertRaisesRegex(DatasetError, "consent_version"):
                load_approved_observations(dataset)

    def test_non_platform_sources_and_missing_consent_version_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "observations.csv"
            write_rows(dataset, count=2)
            with dataset.open(encoding="utf-8") as stream:
                rows = list(csv.DictReader(stream))
            rows[0]["source"] = "unverified_import"
            rows[1]["consent_version"] = ""
            with dataset.open("w", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=FIELDS)
                writer.writeheader()
                writer.writerows(rows)

            accepted, provenance = load_approved_observations(dataset)

            self.assertEqual(accepted, [])
            self.assertEqual(provenance["rows_excluded"]["unsupported_source"], 1)
            self.assertEqual(provenance["rows_excluded"]["consent_version_missing"], 1)

    def test_insufficient_real_data_does_not_write_an_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "observations.csv"
            artifact = Path(directory) / "model.joblib"
            write_rows(dataset, count=19)

            with self.assertRaisesRegex(DatasetError, "At least 50"):
                train_model(dataset, artifact)
            self.assertFalse(artifact.exists())

    def test_predictions_are_unavailable_without_an_artifact(self):
        result = predict_from_artifact(
            None,
            "hospital-test",
            "Cardiology",
            "2027-01-01T10:00:00+00:00",
            "UTC",
        )
        self.assertFalse(result["available"])
        self.assertIsNone(result["predictedWaitMinutes"])

    def test_stale_model_artifact_does_not_produce_a_prediction(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "observations.csv"
            artifact = Path(directory) / "model.joblib"
            write_rows(dataset)
            bundle_metadata = train_model(dataset, artifact)
            bundle_metadata["trainingDataLatestAt"] = (
                datetime.now(timezone.utc) - timedelta(days=366)
            ).isoformat()
            bundle = joblib.load(artifact)
            bundle["metadata"] = bundle_metadata
            joblib.dump(bundle, artifact)

            result = predict_from_artifact(
                bundle,
                "hospital-test",
                "Cardiology",
                (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
                "UTC",
            )

            self.assertFalse(result["available"])
            self.assertEqual(result["method"], "stale_model")

    def test_invalid_timestamps_are_rejected_even_without_a_loaded_model(self):
        with self.assertRaisesRegex(DatasetError, "requested_at"):
            predict_from_artifact(
                None,
                "hospital-test",
                "Cardiology",
                "not-a-time",
                "UTC",
            )

    def test_past_requested_time_is_rejected_even_without_a_loaded_model(self):
        with self.assertRaisesRegex(DatasetError, "must be in the future"):
            predict_from_artifact(
                None,
                "hospital-test",
                "Cardiology",
                "2020-01-01T10:00:00+00:00",
                "UTC",
            )

    def test_pending_or_unconsented_rows_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "observations.csv"
            write_rows(dataset, count=1)
            with dataset.open("a", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=FIELDS)
                writer.writerow(
                    {
                        "observation_id": "pending-test",
                        "hospital_id": "hospital-test",
                        "department": "Cardiology",
                        "arrival_at": "2025-04-01T09:00:00+00:00",
                        "service_start_at": "2025-04-01T09:15:00+00:00",
                        "time_zone": "UTC",
                        "consent": "false",
                        "consent_version": "",
                        "review_status": "pending_review",
                        "reviewed_at": "",
                        "source": "test_fixture_only",
                    }
                )
            rows, _ = load_approved_observations(dataset)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["observation_id"], "test-0")


if __name__ == "__main__":
    unittest.main()
