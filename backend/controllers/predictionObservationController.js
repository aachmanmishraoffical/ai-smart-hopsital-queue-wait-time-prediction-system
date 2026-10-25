const mongoose = require("mongoose");
const PatientWaitObservation = require("../models/PatientWaitObservation");
const Hospital = require("../models/Hospital");

const CONSENT_VERSION = "wait-observation-v1";
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const validTimeZone = (timeZone) => {
  if (typeof timeZone !== "string" || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

const hasExplicitOffset = (value) =>
  typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

const createObservation = async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const department =
    typeof body.department === "string"
      ? body.department.trim().replace(/\s+/g, " ")
      : "";
  const arrivalAt =
    hasExplicitOffset(body.arrivalAt) ? new Date(body.arrivalAt) : null;
  const serviceStartAt =
    hasExplicitOffset(body.serviceStartAt)
      ? new Date(body.serviceStartAt)
      : null;
  const now = new Date();

  if (
    !mongoose.isValidObjectId(body.hospitalId) ||
    !department ||
    department.length > 120 ||
    !arrivalAt ||
    !serviceStartAt ||
    !Number.isFinite(arrivalAt.getTime()) ||
    !Number.isFinite(serviceStartAt.getTime()) ||
    arrivalAt > now ||
    serviceStartAt > now ||
    arrivalAt < new Date(now.getTime() - MAX_AGE_MS) ||
    serviceStartAt < arrivalAt ||
    serviceStartAt.getTime() - arrivalAt.getTime() > MAX_WAIT_MS ||
    !validTimeZone(body.timeZone) ||
    body.consent !== true
  ) {
    return res.status(400).json({
      message:
        "Provide an eligible hospital, department, valid past arrival and service-start times, timezone, and consent.",
    });
  }

  const hospital = await Hospital.findOne({
    _id: body.hospitalId,
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
  }).select("_id");
  if (!hospital) {
    return res.status(404).json({
      message: "A source-attributed hospital directory record is required.",
    });
  }

  const observation = await PatientWaitObservation.create({
    hospitalId: hospital._id,
    department,
    arrivalAt,
    serviceStartAt,
    actualWaitMinutes:
      (serviceStartAt.getTime() - arrivalAt.getTime()) / 60000,
    timeZone: body.timeZone,
    consentAt: now,
    consentVersion: CONSENT_VERSION,
    reviewStatus: "pending_review",
  });

  return res.status(201).json({
    observation: {
      id: observation._id,
      reviewStatus: observation.reviewStatus,
      actualWaitMinutes: observation.actualWaitMinutes,
      message:
        "Your anonymous report is awaiting data review and is not currently used for predictions.",
    },
  });
};

module.exports = { createObservation };
