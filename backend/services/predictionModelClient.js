const getPredictionServiceHealth = async (fetchImpl = fetch) => {
  const configuredUrl = process.env.WAITING_MODEL_URL;
  if (!configuredUrl) {
    return {
      status: "not_configured",
      configured: false,
      modelLoaded: false,
      message:
        "No model service is configured; the backend can use reviewed-observation baseline data.",
    };
  }

  try {
    const response = await fetchImpl(
      `${configuredUrl.replace(/\/+$/, "")}/health`,
      { signal: AbortSignal.timeout(1500) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      typeof result.modelLoaded !== "boolean" ||
      typeof result.message !== "string" ||
      (result.modelLoaded &&
        (typeof result.modelVersion !== "string" || !result.modelVersion))
    ) {
      throw new Error("Prediction service returned an invalid health response.");
    }
    return {
      status: result.modelLoaded ? "model_loaded" : "insufficient_data",
      configured: true,
      modelLoaded: result.modelLoaded === true,
      modelVersion: result.modelVersion || null,
      message: result.message || null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      configured: true,
      modelLoaded: false,
      message: `Prediction service health check failed: ${error.message || error.name}.`,
    };
  }
};

const isTimestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const validatePredictionResponse = (result) => {
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.available !== "boolean" ||
    !Number.isInteger(result.observationCount) ||
    result.observationCount < 0 ||
    !isTimestamp(result.generatedAt)
  ) {
    throw new Error("Prediction service returned an invalid prediction response.");
  }
  if (!result.available) {
    if (
      result.predictedWaitMinutes !== null ||
      typeof result.reason !== "string" ||
      !result.reason.trim()
    ) {
      throw new Error("Prediction service returned an invalid unavailable response.");
    }
    return result;
  }
  if (
    !Number.isInteger(result.predictedWaitMinutes) ||
    result.predictedWaitMinutes < 0 ||
    result.predictedWaitMinutes > 1440 ||
    result.observationCount < 20 ||
    typeof result.modelVersion !== "string" ||
    !result.modelVersion.trim() ||
    !["random_forest", "historical_median_baseline"].includes(result.method) ||
    !isTimestamp(result.dataFreshness)
  ) {
    throw new Error("Prediction service returned an invalid available prediction.");
  }
  if (
    result.empiricalAbsoluteResidual90thPercentileMinutes !== undefined &&
    (!Number.isFinite(
      result.empiricalAbsoluteResidual90thPercentileMinutes,
    ) ||
      result.empiricalAbsoluteResidual90thPercentileMinutes < 0 ||
      result.empiricalAbsoluteResidual90thPercentileMinutes > 1440)
  ) {
    throw new Error("Prediction service returned invalid evaluation metadata.");
  }
  return result;
};

const requestModelPrediction = async (payload, fetchImpl = fetch) => {
  if (!process.env.WAITING_MODEL_URL) return null;
  const response = await fetchImpl(
    `${process.env.WAITING_MODEL_URL.replace(/\/+$/, "")}/predict`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    },
  );
  if (!response.ok) throw new Error(`Prediction service returned HTTP ${response.status}.`);
  return validatePredictionResponse(await response.json());
};

module.exports = {
  getPredictionServiceHealth,
  requestModelPrediction,
  validatePredictionResponse,
};
