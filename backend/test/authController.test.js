const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  loginUser,
  registerUser,
} = require("../controllers/authController");

const originalFindOne = User.findOne;
const originalCreate = User.create;
const originalJwtSecret = process.env.JWT_SECRET;

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

test("registration normalizes email, hashes password, and returns only public fields", async () => {
  process.env.JWT_SECRET = "unit-test-secret-with-at-least-32-characters";
  let saved;
  User.findOne = async () => null;
  User.create = async (record) => {
    saved = { ...record, _id: "user-id" };
    return saved;
  };
  const response = makeResponse();

  await registerUser(
    {
      body: {
        name: "  Patient  ",
        email: "  PATIENT@example.com ",
        password: "correct-horse-battery",
      },
    },
    response,
  );

  assert.equal(response.statusCode, 201);
  assert.equal(saved.name, "Patient");
  assert.equal(saved.email, "patient@example.com");
  assert.notEqual(saved.password, "correct-horse-battery");
  assert.equal(
    await bcrypt.compare("correct-horse-battery", saved.password),
    true,
  );
  assert.deepEqual(response.body.user, {
    id: "user-id",
    name: "Patient",
    email: "patient@example.com",
  });
  assert.equal("password" in response.body.user, false);
  assert.equal(jwt.verify(response.body.token, process.env.JWT_SECRET).role, "patient");
});

test("registration rejects duplicate addresses and unique-index races", async () => {
  User.findOne = async () => ({ _id: "existing" });
  let createCalls = 0;
  User.create = async () => {
    createCalls += 1;
    return null;
  };
  const existingResponse = makeResponse();
  await registerUser(
    {
      body: {
        name: "Patient",
        email: "patient@example.com",
        password: "correct-horse-battery",
      },
    },
    existingResponse,
  );
  assert.equal(existingResponse.statusCode, 409);
  assert.equal(createCalls, 0);

  User.findOne = async () => null;
  User.create = async () => {
    const error = new Error("Duplicate key");
    error.code = 11000;
    error.keyPattern = { email: 1 };
    throw error;
  };
  const raceResponse = makeResponse();
  await registerUser(
    {
      body: {
        name: "Patient",
        email: "patient@example.com",
        password: "correct-horse-battery",
      },
    },
    raceResponse,
  );
  assert.equal(raceResponse.statusCode, 409);
  assert.equal(raceResponse.body.message, "Email already exists");
});

test("registration rejects invalid fields before persistence", async () => {
  let databaseCalls = 0;
  User.findOne = async () => {
    databaseCalls += 1;
    return null;
  };
  User.create = async () => {
    databaseCalls += 1;
  };
  const response = makeResponse();
  await registerUser(
    {
      body: {
        name: "Patient",
        email: "not-an-email",
        password: "short",
      },
    },
    response,
  );
  assert.equal(response.statusCode, 400);
  assert.equal(databaseCalls, 0);
});

test("registration and login reject non-object request bodies without persistence", async () => {
  let databaseCalls = 0;
  User.findOne = async () => {
    databaseCalls += 1;
    return null;
  };
  User.create = async () => {
    databaseCalls += 1;
  };

  const registrationResponse = makeResponse();
  await registerUser({ body: null }, registrationResponse);
  assert.equal(registrationResponse.statusCode, 400);

  const loginResponse = makeResponse();
  await loginUser({ body: null }, loginResponse);
  assert.equal(loginResponse.statusCode, 401);
  assert.equal(databaseCalls, 0);
});

test("registration never reports success when persistence fails", async () => {
  User.findOne = async () => null;
  User.create = async () => {
    throw new Error("Persistence failed");
  };
  const response = makeResponse();
  await assert.rejects(
    registerUser(
      {
        body: {
          name: "Patient",
          email: "patient@example.com",
          password: "correct-horse-battery",
        },
      },
      response,
    ),
    /Persistence failed/,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, null);
});

test("login uses normalized email and verifies the stored password hash", async () => {
  process.env.JWT_SECRET = "unit-test-secret-with-at-least-32-characters";
  const passwordHash = await bcrypt.hash("correct-horse-battery", 4);
  let query;
  User.findOne = async (filter) => {
    query = filter;
    return {
      _id: "user-id",
      name: "Patient",
      email: "patient@example.com",
      password: passwordHash,
    };
  };
  const response = makeResponse();

  await loginUser(
    {
      body: { email: " PATIENT@EXAMPLE.COM ", password: "correct-horse-battery" },
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(query.email.$options, "i");
  assert.equal("password" in response.body.user, false);
  assert.equal(jwt.verify(response.body.token, process.env.JWT_SECRET).role, "patient");

  const badPasswordResponse = makeResponse();
  await loginUser(
    {
      body: { email: "patient@example.com", password: "wrong-password" },
    },
    badPasswordResponse,
  );
  assert.equal(badPasswordResponse.statusCode, 401);
  assert.equal(badPasswordResponse.body.message, "Invalid email or password");
});

test.after(() => {
  User.findOne = originalFindOne;
  User.create = originalCreate;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
