const test = require("node:test");
const assert = require("node:assert/strict");
const Hospital = require("../models/Hospital");
const PatientWaitObservation = require("../models/PatientWaitObservation");
const { createObservation } = require("../controllers/predictionObservationController");

const originalHospitalFindOne = Hospital.findOne;
const originalObservationCreate = PatientWaitObservation.create;
const HOSPITAL_ID = "65a000000000000000000001";
const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
const makeRequest = (body = {}) => ({
  body: {
    hospitalId: HOSPITAL_ID,
    department: "Cardiology",
    arrivalAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    serviceStartAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    timeZone: "UTC",
    consent: true,
    ...body,
  },
});

test.beforeEach(() => {
  Hospital.findOne = () => ({ select: async () => ({ _id: HOSPITAL_ID }) });
  PatientWaitObservation.create = async (record) => ({
    ...record,
    _id: "observation-id",
  });
});

test.afterEach(() => {
  Hospital.findOne = originalHospitalFindOne;
  PatientWaitObservation.create = originalObservationCreate;
});

test("stores only a consented, anonymous observation pending review", async () => {
  let saved;
  PatientWaitObservation.create = async (record) => {
    saved = record;
    return { ...record, _id: "observation-id" };
  };
  const response = makeResponse();

  await createObservation(makeRequest(), response);

  assert.equal(response.statusCode, 201);
  assert.equal(saved.reviewStatus, "pending_review");
  assert.ok(Math.abs(saved.actualWaitMinutes - 30) < 0.01);
  assert.equal(saved.consentVersion, "wait-observation-v1");
  assert.equal("userId" in saved, false);
});

test("rejects missing consent and timestamps without explicit timezone offsets", async () => {
  let createCalls = 0;
  PatientWaitObservation.create = async () => {
    createCalls += 1;
  };
  const noConsent = makeResponse();
  await createObservation(makeRequest({ consent: false }), noConsent);
  const noOffset = makeResponse();
  await createObservation(
    makeRequest({ arrivalAt: "2026-06-01T09:00:00" }),
    noOffset,
  );

  assert.equal(noConsent.statusCode, 400);
  assert.equal(noOffset.statusCode, 400);
  assert.equal(createCalls, 0);
});
