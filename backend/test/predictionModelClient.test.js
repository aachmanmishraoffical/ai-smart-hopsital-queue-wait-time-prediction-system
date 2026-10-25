const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getPredictionServiceHealth,
  requestModelPrediction,
  validatePredictionResponse,
} = require("../services/predictionModelClient");

const originalUrl = process.env.WAITING_MODEL_URL;
const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 503,
  json: async () => body,
});

test.afterEach(() => {
  if (originalUrl === undefined) delete process.env.WAITING_MODEL_URL;
  else process.env.WAITING_MODEL_URL = originalUrl;
});

test("accepts a valid available prediction from a trained artifact contract", () => {
  const now = new Date().toISOString();
  const result = validatePredictionResponse({
    available: true,
    predictedWaitMinutes: 35,
    method: "random_forest",
    reason: null,
    modelVersion: "wait-rf-1.1.0",
    observationCount: 32,
    generatedAt: now,
    dataFreshness: now,
    empiricalAbsoluteResidual90thPercentileMinutes: 8,
  });

  assert.equal(result.predictedWaitMinutes, 35);
});

test("rejects invalid prediction values and malformed unavailable responses", () => {
  const valid = {
    available: true,
    predictedWaitMinutes: 35,
    method: "random_forest",
    modelVersion: "wait-rf-1.1.0",
    observationCount: 32,
    generatedAt: new Date().toISOString(),
    dataFreshness: new Date().toISOString(),
  };
  assert.throws(
    () => validatePredictionResponse({ ...valid, predictedWaitMinutes: 1441 }),
    /invalid available prediction/,
  );
  assert.throws(
    () => validatePredictionResponse({ ...valid, observationCount: 4 }),
    /invalid available prediction/,
  );
  assert.throws(
    () =>
      validatePredictionResponse({
        available: false,
        predictedWaitMinutes: 20,
        reason: "",
        observationCount: 0,
        generatedAt: new Date().toISOString(),
      }),
    /invalid unavailable response/,
  );
});

test("prediction endpoint rejects malformed successful provider responses", async () => {
  process.env.WAITING_MODEL_URL = "http://127.0.0.1:8100";
  await assert.rejects(
    requestModelPrediction(
      {
        hospitalId: "hospital",
        department: "Cardiology",
        requestedAt: new Date().toISOString(),
        timeZone: "UTC",
      },
      async () => response({ available: true, predictedWaitMinutes: 99999 }),
    ),
    /invalid prediction response/,
  );
});

test("health status does not report malformed model-service responses as ready", async () => {
  process.env.WAITING_MODEL_URL = "http://127.0.0.1:8100";
  const result = await getPredictionServiceHealth(async () =>
    response({ status: "ok" }),
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.modelLoaded, false);
});
