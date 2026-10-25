const express = require("express");
const mongoose = require("mongoose");
const { predictWaitingTime } = require("../services/predictionService");
const { predictSlotWait } = require("../services/predictionService");
const asyncHandler = require("../middleware/asyncHandler");
const router = express.Router();

const isTimeZone = (value) => {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

router.post("/", asyncHandler(async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const { hospitalId, doctorId } = body;
  if (
    !mongoose.isValidObjectId(hospitalId) ||
    !mongoose.isValidObjectId(doctorId)
  ) {
    return res.status(400).json({ message: "Valid hospital and doctor IDs are required." });
  }
  const prediction = await predictWaitingTime({
    hospitalId,
    doctorId,
  });
  res.json(prediction);
}));

router.post("/slot", asyncHandler(async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const requestedAt =
    typeof body.requestedAt === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(body.requestedAt)
      ? new Date(body.requestedAt)
      : null;
  if (
    !mongoose.isValidObjectId(body.hospitalId) ||
    typeof body.department !== "string" ||
    !body.department.trim() ||
    body.department.trim().length > 120 ||
    !requestedAt ||
    !Number.isFinite(requestedAt.getTime()) ||
    requestedAt <= new Date() ||
    !isTimeZone(body.timeZone)
  ) {
    return res.status(400).json({
      message: "A valid hospital, department, future time, and timezone are required.",
    });
  }
  const prediction = await predictSlotWait({
    hospitalId: body.hospitalId,
    department: body.department.trim(),
    requestedAt,
    timeZone: body.timeZone,
  });
  return res.json(prediction);
}));

module.exports = router;
