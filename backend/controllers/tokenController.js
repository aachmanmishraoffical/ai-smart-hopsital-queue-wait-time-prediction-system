const { randomBytes } = require("crypto");
const mongoose = require("mongoose");
const DigitalToken = require("../models/DigitalToken");
const Hospital = require("../models/Hospital");
const Doctor = require("../models/Doctor");

const TOKEN_SELECT =
  "tokenCode department requestedAt status hospitalId doctorId createdAt";

const sameId = (stored, requested) =>
  String(stored).toLowerCase() === String(requested).toLowerCase();

const publicToken = (token) => ({
  id: token._id,
  tokenCode: token.tokenCode,
  department: token.department,
  requestedAt: token.requestedAt || null,
  status: token.status,
  hospitalId: token.hospitalId,
  doctorId: token.doctorId,
  createdAt: token.createdAt,
});

const withDetails = (query) =>
  query.populate("hospitalId", "hospitalName address source participating")
    .populate("doctorId", "name department");

const createToken = async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const { hospitalId, doctorId } = body;
  const requestedAt =
    typeof body.requestedAt === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(body.requestedAt)
      ? new Date(body.requestedAt)
      : null;
  const idempotencyKey = req.get("Idempotency-Key");
  if (
    !mongoose.isValidObjectId(hospitalId) ||
    !mongoose.isValidObjectId(doctorId) ||
    (body.requestedAt !== undefined &&
      (!requestedAt ||
        !Number.isFinite(requestedAt.getTime()) ||
        requestedAt <= new Date())) ||
    typeof idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey)
  ) {
    return res.status(400).json({
      message: "Valid hospital and doctor IDs and an idempotency key are required.",
    });
  }

  const existingToken = await DigitalToken.findOne({
    userId: req.user._id,
    idempotencyKey,
  });
  if (existingToken) {
    if (
      !sameId(existingToken.hospitalId, hospitalId) ||
      !sameId(existingToken.doctorId, doctorId) ||
      (requestedAt &&
        new Date(existingToken.requestedAt).getTime() !== requestedAt.getTime())
    ) {
      return res.status(409).json({
        message: "This request key was already used for a different selection.",
      });
    }
    return res
      .status(200)
      .json({ token: publicToken(existingToken), idempotent: true });
  }

  const hospital = await Hospital.findOne({
    _id: hospitalId,
    participating: true,
    "source.verificationStatus": "verified",
  }).select("_id");
  if (!hospital) {
    return res.status(409).json({
      message:
        "A verified participating hospital is required to issue a token.",
    });
  }
  const doctor = await Doctor.findOne({
    _id: doctorId,
    hospitalId,
    active: true,
    status: "available",
    "source.verificationStatus": "verified",
  }).select("_id department");
  if (
    !doctor ||
    typeof doctor.department !== "string" ||
    !doctor.department.trim()
  ) {
    return res.status(409).json({
      message:
        "A currently verified, active, available provider with a department at this hospital is required.",
    });
  }

  try {
    const token = await DigitalToken.create({
      tokenCode: `PLT-${randomBytes(16).toString("hex").toUpperCase()}`,
      idempotencyKey,
      userId: req.user._id,
      hospitalId: hospital._id,
      doctorId: doctor._id,
      department: doctor.department,
      ...(requestedAt ? { requestedAt } : {}),
    });
    return res.status(201).json({ token: publicToken(token) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const duplicate = await DigitalToken.findOne({
      userId: req.user._id,
      idempotencyKey,
    });
    if (!duplicate) throw error;
    if (
      !sameId(duplicate.hospitalId, hospitalId) ||
      !sameId(duplicate.doctorId, doctorId) ||
      (requestedAt &&
        new Date(duplicate.requestedAt).getTime() !== requestedAt.getTime())
    ) {
      return res.status(409).json({
        message: "This request key was already used for a different selection.",
      });
    }
    return res
      .status(200)
      .json({ token: publicToken(duplicate), idempotent: true });
  }
};

const getMyTokens = async (req, res) => {
  const tokens = await withDetails(
    DigitalToken.find({ userId: req.user._id })
      .select(TOKEN_SELECT)
      .sort({ createdAt: -1 })
      .limit(100),
  );
  return res.json({ tokens });
};

const getMyToken = async (req, res) => {
  const token = await withDetails(
    DigitalToken.findOne({
      tokenCode: req.params.tokenCode,
      userId: req.user._id,
    }).select(TOKEN_SELECT),
  );
  if (!token) return res.status(404).json({ message: "Token not found." });
  return res.json({ token });
};

module.exports = { createToken, getMyTokens, getMyToken };
