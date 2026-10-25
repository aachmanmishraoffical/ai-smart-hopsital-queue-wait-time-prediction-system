const test = require("node:test");
const assert = require("node:assert/strict");
const AppointmentRequest = require("../models/AppointmentRequest");
const Hospital = require("../models/Hospital");
const {
  cancelAppointmentRequest,
  createAppointmentRequest,
  getAppointmentRequest,
} = require("../controllers/appointmentRequestController");

const originalMethods = {
  findOne: AppointmentRequest.findOne,
  create: AppointmentRequest.create,
  findOneAndUpdate: AppointmentRequest.findOneAndUpdate,
  exists: AppointmentRequest.exists,
  hospitalFindOne: Hospital.findOne,
};
const HOSPITAL_ID = "65a000000000000000000001";
const USER_ID = "65a000000000000000000002";
const REQUESTED_AT = new Date(Date.now() + 60 * 60 * 1000);
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
const makeRequest = (overrides = {}) => ({
  body: {
    hospitalId: HOSPITAL_ID,
    department: " Cardiology ",
    requestedAt: REQUESTED_AT.toISOString(),
    timeZone: "UTC",
    acknowledgedNotSent: true,
  },
  user: { _id: USER_ID },
  params: { reference: "REQ-REFERENCE" },
  get: () => "request-key-1234",
  ...overrides,
});
const makeHospital = () => ({
  _id: HOSPITAL_ID,
  hospitalName: "Listed Hospital",
  address: "Directory address",
  source: {
    name: "Public directory",
    url: "https://directory.example/hospitals",
    recordId: "directory-record-1",
    retrievedAt: new Date(),
    verificationStatus: "source_listed",
  },
});
const makeSavedRequest = (record) => ({
  ...record,
  createdAt: new Date(),
});

test("database schema enforces unique references and per-patient idempotency keys", () => {
  const indexes = AppointmentRequest.schema.indexes();

  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.reference === 1 && options.unique === true,
    ),
  );
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.userId === 1 &&
        fields.idempotencyKey === 1 &&
        options.unique === true,
    ),
  );
});

test.beforeEach(() => {
  Hospital.findOne = () => ({ select: async () => makeHospital() });
  AppointmentRequest.findOne = async () => null;
  AppointmentRequest.create = async (record) => makeSavedRequest(record);
});

test.afterEach(() => {
  AppointmentRequest.findOne = originalMethods.findOne;
  AppointmentRequest.create = originalMethods.create;
  AppointmentRequest.findOneAndUpdate = originalMethods.findOneAndUpdate;
  AppointmentRequest.exists = originalMethods.exists;
  Hospital.findOne = originalMethods.hospitalFindOne;
});

test("saves a private, idempotent request with patient ownership and source snapshot", async () => {
  let saved;
  AppointmentRequest.create = async (record) => {
    saved = makeSavedRequest(record);
    return saved;
  };
  const response = makeResponse();

  await createAppointmentRequest(makeRequest(), response);

  assert.equal(response.statusCode, 201);
  assert.match(saved.reference, /^REQ-[A-F0-9]{24}$/);
  assert.equal(saved.userId, USER_ID);
  assert.equal(saved.department, "Cardiology");
  assert.equal(saved.status, "pending_external_confirmation");
  assert.equal(saved.patientAcknowledgedNotSent, true);
  assert.equal(saved.hospitalSnapshot.sourceName, "Public directory");
  assert.equal(response.body.request.confirmationStatus, "not_sent_to_hospital");
  assert.equal("userId" in response.body.request, false);
});

test("requires explicit non-transmission acknowledgment before database access", async () => {
  let databaseCalls = 0;
  Hospital.findOne = () => {
    databaseCalls += 1;
    return { select: async () => makeHospital() };
  };
  const response = makeResponse();

  await createAppointmentRequest(
    makeRequest({ body: { ...makeRequest().body, acknowledgedNotSent: false } }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test("rejects an absent or non-object request body without throwing", async () => {
  let databaseCalls = 0;
  AppointmentRequest.findOne = async () => {
    databaseCalls += 1;
    return null;
  };
  const response = makeResponse();

  await createAppointmentRequest(makeRequest({ body: undefined }), response);

  assert.equal(response.statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test("returns the same stored request for a matching idempotency key", async () => {
  const request = makeSavedRequest({
    reference: "REQ-EXISTING",
    hospitalId: HOSPITAL_ID,
    department: "Cardiology",
    requestedAt: REQUESTED_AT,
    timeZone: "UTC",
    status: "pending_external_confirmation",
    hospitalSnapshot: {
      name: "Listed Hospital",
      address: "Directory address",
      sourceName: "Public directory",
      sourceUrl: "https://directory.example/hospitals",
      sourceRecordId: "directory-record-1",
      sourceRetrievedAt: new Date(),
      verificationStatus: "source_listed",
    },
  });
  AppointmentRequest.findOne = async () => request;
  const response = makeResponse();

  await createAppointmentRequest(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idempotent, true);
  assert.equal(response.body.request.reference, "REQ-EXISTING");
});

test("unique-index races resolve to the original idempotent request", async () => {
  const request = makeSavedRequest({
    reference: "REQ-RACE",
    hospitalId: HOSPITAL_ID,
    department: "Cardiology",
    requestedAt: REQUESTED_AT,
    timeZone: "UTC",
    status: "pending_external_confirmation",
    hospitalSnapshot: {
      name: "Listed Hospital",
      address: "Directory address",
      sourceName: "Public directory",
      sourceUrl: "https://directory.example/hospitals",
      sourceRecordId: "directory-record-1",
      sourceRetrievedAt: new Date(),
      verificationStatus: "source_listed",
    },
  });
  let lookups = 0;
  AppointmentRequest.findOne = async () => {
    lookups += 1;
    return lookups === 1 ? null : request;
  };
  AppointmentRequest.create = async () => {
    const error = new Error("Duplicate index key");
    error.code = 11000;
    throw error;
  };
  const response = makeResponse();

  await createAppointmentRequest(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idempotent, true);
  assert.equal(response.body.request.reference, "REQ-RACE");
});

test("returns the saved request only when reference and patient both match", async () => {
  let filter;
  AppointmentRequest.findOne = async (query) => {
    filter = query;
    return null;
  };
  const response = makeResponse();

  await getAppointmentRequest(makeRequest(), response);

  assert.deepEqual(filter, { userId: USER_ID, reference: "REQ-REFERENCE" });
  assert.equal(response.statusCode, 404);
});

test("cancellation is conditional on ownership, pending status, and future time", async () => {
  let filter;
  AppointmentRequest.findOneAndUpdate = async (query) => {
    filter = query;
    return null;
  };
  AppointmentRequest.exists = async () => true;
  const response = makeResponse();

  await cancelAppointmentRequest(makeRequest(), response);

  assert.equal(filter.userId, USER_ID);
  assert.equal(filter.reference, "REQ-REFERENCE");
  assert.equal(filter.status, "pending_external_confirmation");
  assert.ok(filter.requestedAt.$gt instanceof Date);
  assert.equal(response.statusCode, 409);
});

test("successful cancellation returns the persisted cancelled request", async () => {
  let filter;
  AppointmentRequest.findOneAndUpdate = async (query, update) => {
    filter = query;
    return {
      reference: "REQ-REFERENCE",
      userId: USER_ID,
      hospitalSnapshot: makeHospital(),
      department: "Cardiology",
      requestedAt: REQUESTED_AT,
      timeZone: "UTC",
      status: update.$set.status,
      cancelledAt: update.$set.cancelledAt,
      createdAt: new Date(),
    };
  };
  const response = makeResponse();

  await cancelAppointmentRequest(makeRequest(), response);

  assert.equal(filter.userId, USER_ID);
  assert.equal(response.body.request.status, "cancelled");
  assert.ok(response.body.request.cancelledAt);
});
