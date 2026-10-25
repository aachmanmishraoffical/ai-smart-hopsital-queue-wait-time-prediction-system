const test = require("node:test");
const assert = require("node:assert/strict");
const DigitalToken = require("../models/DigitalToken");
const Hospital = require("../models/Hospital");
const Doctor = require("../models/Doctor");
const {
  createToken,
  getMyToken,
} = require("../controllers/tokenController");

const originalTokenFindOne = DigitalToken.findOne;
const originalTokenCreate = DigitalToken.create;
const originalHospitalFindOne = Hospital.findOne;
const originalDoctorFindOne = Doctor.findOne;
const HOSPITAL_ID = "65a000000000000000000001";
const DOCTOR_ID = "65a000000000000000000002";

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
  body: { hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID },
  user: { _id: "patient-id" },
  get(name) {
    return name === "Idempotency-Key" ? "request-key-1234" : undefined;
  },
  params: { tokenCode: "PLT-0123456789ABCDEF" },
  ...overrides,
});

const makeQuery = (result) => ({
  select() {
    return this;
  },
  populate() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(result).then(resolve, reject);
  },
});

test("token issuance persists a unique platform token for the authenticated patient", async () => {
  let createdRecord;
  let hospitalFilter;
  let doctorFilter;
  DigitalToken.findOne = async () => null;
  Hospital.findOne = (filter) => {
    hospitalFilter = filter;
    return {
      select: async () => ({ _id: HOSPITAL_ID }),
    };
  };
  Doctor.findOne = (filter) => {
    doctorFilter = filter;
    return {
      select: async () => ({
        _id: DOCTOR_ID,
        department: "Cardiology",
      }),
    };
  };
  DigitalToken.create = async (record) => {
    createdRecord = {
      ...record,
      _id: "token-id",
      createdAt: new Date("2026-10-22T00:00:00.000Z"),
    };
    return createdRecord;
  };

  const response = makeResponse();
  await createToken(makeRequest(), response);

  assert.equal(response.statusCode, 201);
  assert.match(response.body.token.tokenCode, /^PLT-[A-F0-9]{32}$/);
  assert.equal(createdRecord.userId, "patient-id");
  assert.equal(createdRecord.department, "Cardiology");
  assert.equal(createdRecord.idempotencyKey, "request-key-1234");
  assert.deepEqual(hospitalFilter, {
    _id: HOSPITAL_ID,
    participating: true,
    "source.verificationStatus": "verified",
  });
  assert.deepEqual(doctorFilter, {
    _id: DOCTOR_ID,
    hospitalId: HOSPITAL_ID,
    active: true,
    status: "available",
    "source.verificationStatus": "verified",
  });
  assert.equal("idempotencyKey" in response.body.token, false);
  assert.equal("userId" in response.body.token, false);
});

test("token issuance rejects an eligible provider record without a department", async () => {
  DigitalToken.findOne = async () => null;
  Hospital.findOne = () => ({
    select: async () => ({ _id: HOSPITAL_ID }),
  });
  Doctor.findOne = () => ({
    select: async () => ({ _id: DOCTOR_ID, department: "  " }),
  });
  let createCalls = 0;
  DigitalToken.create = async () => {
    createCalls += 1;
  };

  const response = makeResponse();
  await createToken(makeRequest(), response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /provider with a department/);
  assert.equal(createCalls, 0);
});

test("token issuance returns the persisted token for an identical retry", async () => {
  let hospitalLookups = 0;
  const existing = {
    _id: "token-id",
    tokenCode: "PLT-0123456789ABCDEF",
    userId: "patient-id",
    hospitalId: HOSPITAL_ID,
    doctorId: DOCTOR_ID,
    department: "Cardiology",
    status: "issued",
    createdAt: new Date(),
  };
  DigitalToken.findOne = async () => existing;
  Hospital.findOne = () => {
    hospitalLookups += 1;
    return null;
  };

  const response = makeResponse();
  await createToken(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idempotent, true);
  assert.equal(response.body.token.tokenCode, existing.tokenCode);
  assert.equal(hospitalLookups, 0);
});

test("token issuance resolves a concurrent duplicate through its idempotency key", async () => {
  const existing = {
    _id: "token-id",
    tokenCode: "PLT-0123456789ABCDEF0123456789ABCDEF",
    userId: "patient-id",
    hospitalId: HOSPITAL_ID,
    doctorId: DOCTOR_ID,
    department: "Cardiology",
    status: "issued",
    createdAt: new Date(),
  };
  let lookupCount = 0;
  DigitalToken.findOne = async () => {
    lookupCount += 1;
    return lookupCount === 1 ? null : existing;
  };
  Hospital.findOne = () => ({
    select: async () => ({ _id: HOSPITAL_ID }),
  });
  Doctor.findOne = () => ({
    select: async () => ({ _id: DOCTOR_ID, department: "Cardiology" }),
  });
  DigitalToken.create = async () => {
    const error = new Error("Unique request key");
    error.code = 11000;
    throw error;
  };

  const response = makeResponse();
  await createToken(makeRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.idempotent, true);
  assert.equal(response.body.token.tokenCode, existing.tokenCode);
});

test("token issuance rejects malformed selection and request keys before persistence", async () => {
  let databaseCalls = 0;
  DigitalToken.findOne = async () => {
    databaseCalls += 1;
    return null;
  };
  const response = makeResponse();
  await createToken(
    makeRequest({
      body: { hospitalId: "invalid", doctorId: DOCTOR_ID },
      get: () => "short",
    }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test("token issuance stores the requested slot without changing token status", async () => {
  const requestedAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  let createdRecord;
  DigitalToken.findOne = async () => null;
  Hospital.findOne = () => ({
    select: async () => ({ _id: HOSPITAL_ID }),
  });
  Doctor.findOne = () => ({
    select: async () => ({ _id: DOCTOR_ID, department: "Cardiology" }),
  });
  DigitalToken.create = async (record) => {
    createdRecord = {
      ...record,
      _id: "token-id",
      createdAt: new Date(),
      status: "issued",
    };
    return createdRecord;
  };

  const response = makeResponse();
  await createToken(
    makeRequest({
      body: { hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID, requestedAt },
    }),
    response,
  );

  assert.equal(response.statusCode, 201);
  assert.equal(createdRecord.requestedAt.toISOString(), requestedAt);
  assert.equal(response.body.token.requestedAt, createdRecord.requestedAt);
  assert.equal(response.body.token.status, "issued");
});

test("token issuance rejects invalid or past requested slots before persistence", async () => {
  let databaseCalls = 0;
  DigitalToken.findOne = async () => {
    databaseCalls += 1;
    return null;
  };

  for (const requestedAt of [
    "not-a-date",
    new Date(Date.now() - 1000).toISOString(),
  ]) {
    const response = makeResponse();
    await createToken(
      makeRequest({
        body: { hospitalId: HOSPITAL_ID, doctorId: DOCTOR_ID, requestedAt },
      }),
      response,
    );
    assert.equal(response.statusCode, 400);
  }

  assert.equal(databaseCalls, 0);
});

test("token retrieval scopes the lookup to the authenticated patient", async () => {
  let lookup;
  const token = {
    _id: "token-id",
    tokenCode: "PLT-0123456789ABCDEF",
    department: "Cardiology",
    status: "issued",
    requestedAt: null,
  };
  DigitalToken.findOne = (filter) => {
    lookup = filter;
    return makeQuery(token);
  };

  const response = makeResponse();
  await getMyToken(makeRequest(), response);

  assert.deepEqual(lookup, {
    tokenCode: "PLT-0123456789ABCDEF",
    userId: "patient-id",
  });
  assert.equal(response.body.token, token);
});

test.after(() => {
  DigitalToken.findOne = originalTokenFindOne;
  DigitalToken.create = originalTokenCreate;
  Hospital.findOne = originalHospitalFindOne;
  Doctor.findOne = originalDoctorFindOne;
});
