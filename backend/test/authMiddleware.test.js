const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protectUser } = require("../middleware/authMiddleware");

const originalFindById = User.findById;
const originalJwtSecret = process.env.JWT_SECRET;
const secret = "middleware-test-secret-at-least-32-characters";

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

test.before(() => {
  process.env.JWT_SECRET = secret;
});

test("patient route rejects missing, malformed, and expired tokens", async () => {
  let databaseCalls = 0;
  User.findById = () => {
    databaseCalls += 1;
    throw new Error("Database should not be reached");
  };
  for (const token of [
    undefined,
    "not-a-jwt",
    jwt.sign({ id: "user-id", role: "patient" }, secret, { expiresIn: -1 }),
  ]) {
    const response = makeResponse();
    const request = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    let nextCalls = 0;
    await protectUser(request, response, () => {
      nextCalls += 1;
    });
    assert.equal(response.statusCode, 401);
    assert.equal(nextCalls, 0);
  }
  assert.equal(databaseCalls, 0);
});

test("patient route checks token role and loads the persisted user", async () => {
  let requestedId;
  User.findById = (id) => {
    requestedId = id;
    return {
      select: async () => ({
        _id: id,
        name: "Patient",
        email: "patient@example.com",
      }),
    };
  };
  const token = jwt.sign({ id: "user-id", role: "patient" }, secret, {
    expiresIn: "1m",
  });
  const response = makeResponse();
  let nextCalls = 0;

  await protectUser(
    { headers: { authorization: `Bearer ${token}` } },
    response,
    () => {
      nextCalls += 1;
    },
  );

  assert.equal(requestedId, "user-id");
  assert.equal(nextCalls, 1);
});

test.after(() => {
  User.findById = originalFindById;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});
