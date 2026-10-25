import os
from pathlib import Path

from flask import Flask, jsonify, request

from waiting_time_model import DatasetError, load_artifact, predict_from_artifact


DEFAULT_ARTIFACT = Path(__file__).parent / "artifacts" / "wait_model.joblib"
ARTIFACT_PATH = os.environ.get("WAITING_MODEL_ARTIFACT", str(DEFAULT_ARTIFACT))
app = Flask(__name__)
bundle = load_artifact(ARTIFACT_PATH)


@app.get("/health")
def health():
    metadata = bundle["metadata"] if bundle else None
    return jsonify(
        {
            "status": "ok",
            "modelLoaded": bundle is not None,
            "modelVersion": metadata["modelVersion"] if metadata else None,
            "message": (
                "An evaluated model artifact is loaded."
                if metadata
                else "No trained model artifact is installed."
            ),
        }
    )


@app.post("/predict")
def predict():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"message": "A JSON request body is required."}), 400
    hospital_id = body.get("hospitalId")
    department = body.get("department")
    requested_at = body.get("requestedAt")
    time_zone = body.get("timeZone")
    if (
        not isinstance(hospital_id, str)
        or not hospital_id.strip()
        or not isinstance(department, str)
        or not department.strip()
        or not isinstance(requested_at, str)
        or not isinstance(time_zone, str)
    ):
        return jsonify(
            {
                "message": (
                    "hospitalId, department, requestedAt, and timeZone are required."
                )
            }
        ), 400
    try:
        result = predict_from_artifact(
            bundle,
            hospital_id.strip(),
            " ".join(department.split()),
            requested_at,
            time_zone,
        )
    except DatasetError as error:
        return jsonify({"message": str(error)}), 400
    return jsonify(result)


if __name__ == "__main__":
    app.run(
        host=os.environ.get("WAITING_MODEL_HOST", "127.0.0.1"),
        port=int(os.environ.get("WAITING_MODEL_PORT", "8100")),
    )
