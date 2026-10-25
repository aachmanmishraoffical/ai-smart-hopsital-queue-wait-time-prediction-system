const { randomBytes } = require("crypto");
const mongoose = require("mongoose");
const AppointmentRequest = require("../models/AppointmentRequest");
const Hospital = require("../models/Hospital");

const normalizeDepartment = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const sameRequest = (request, hospitalId, department, requestedAt, timeZone) =>
  String(request.hospitalId) === String(hospitalId) &&
  request.department === department &&
  new Date(request.requestedAt).getTime() === requestedAt.getTime() &&
  request.timeZone === timeZone;

const publicRequest = (request) => ({
  reference: request.reference,
  hospital: request.hospitalSnapshot,
  department: request.department,
  requestedAt: request.requestedAt,
  timeZone: request.timeZone,
  status: request.status,
  confirmationStatus: "not_sent_to_hospital",
  message:
    "This request is saved in your platform account only. It has not been sent to or accepted by the hospital.",
  createdAt: request.createdAt,
  cancelledAt: request.cancelledAt || null,
});

const validateTimeZone = (timeZone) => {
  if (typeof timeZone !== "string" || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
};

const createAppointmentRequest = async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const { hospitalId, department: departmentValue, requestedAt: requestedAtValue, timeZone } =
    body;
  const department = normalizeDepartment(departmentValue);
  const requestedAt =
    typeof requestedAtValue === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(requestedAtValue)
      ? new Date(requestedAtValue)
      : null;
  const idempotencyKey = req.get("Idempotency-Key");

  if (
    !mongoose.isValidObjectId(hospitalId) ||
    !department ||
    department.length > 120 ||
    !requestedAt ||
    !Number.isFinite(requestedAt.getTime()) ||
    requestedAt <= new Date() ||
    requestedAt > new Date(Date.now() + 366 * 24 * 60 * 60 * 1000) ||
    !validateTimeZone(timeZone) ||
    typeof idempotencyKey !== "string" ||
    !/^[a-zA-Z0-9._:-]{8,128}$/.test(idempotencyKey) ||
    body.acknowledgedNotSent !== true
  ) {
    return res.status(400).json({
      message:
        "Provide a hospital, department, future date and time with timezone, request key, and acknowledgment that the request is not sent to the hospital.",
    });
  }

  const existing = await AppointmentRequest.findOne({
    userId: req.user._id,
    idempotencyKey,
  });
  if (existing) {
    if (
      !sameRequest(existing, hospitalId, department, requestedAt, timeZone)
    ) {
      return res.status(409).json({
        message: "This request key was already used for a different request.",
      });
    }
    return res.status(200).json({
      request: publicRequest(existing),
      idempotent: true,
    });
  }

  const hospital = await Hospital.findOne({
    _id: hospitalId,
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
  }).select(
    "hospitalName address source.name source.url source.recordId source.retrievedAt source.verificationStatus",
  );
  if (!hospital) {
    return res.status(404).json({
      message: "A source-attributed hospital directory record is required.",
    });
  }

  const record = {
    reference: `REQ-${randomBytes(12).toString("hex").toUpperCase()}`,
    idempotencyKey,
    userId: req.user._id,
    hospitalId: hospital._id,
    hospitalSnapshot: {
      name: hospital.hospitalName,
      address: hospital.address,
      sourceName: hospital.source.name,
      sourceUrl: hospital.source.url,
      sourceRecordId: hospital.source.recordId,
      sourceRetrievedAt: hospital.source.retrievedAt,
      verificationStatus: hospital.source.verificationStatus,
    },
    department,
    requestedAt,
    timeZone,
    patientAcknowledgedNotSent: true,
    status: "pending_external_confirmation",
  };

  try {
    const request = await AppointmentRequest.create(record);
    return res.status(201).json({ request: publicRequest(request) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const duplicate = await AppointmentRequest.findOne({
      userId: req.user._id,
      idempotencyKey,
    });
    if (!duplicate) throw error;
    if (!sameRequest(duplicate, hospitalId, department, requestedAt, timeZone)) {
      return res.status(409).json({
        message: "This request key was already used for a different request.",
      });
    }
    return res.status(200).json({
      request: publicRequest(duplicate),
      idempotent: true,
    });
  }
};

const getMyAppointmentRequests = async (req, res) => {
  const requests = await AppointmentRequest.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100);
  return res.json({ requests: requests.map(publicRequest) });
};

const getAppointmentRequest = async (req, res) => {
  const request = await AppointmentRequest.findOne({
    userId: req.user._id,
    reference: req.params.reference,
  });
  if (!request) {
    return res.status(404).json({ message: "Appointment request not found." });
  }
  return res.json({ request: publicRequest(request) });
};

const cancelAppointmentRequest = async (req, res) => {
  const request = await AppointmentRequest.findOneAndUpdate(
    {
      userId: req.user._id,
      reference: req.params.reference,
      status: "pending_external_confirmation",
      requestedAt: { $gt: new Date() },
    },
    {
      $set: { status: "cancelled", cancelledAt: new Date() },
    },
    { new: true, runValidators: true },
  );
  if (!request) {
    const existing = await AppointmentRequest.exists({
      userId: req.user._id,
      reference: req.params.reference,
    });
    return res.status(existing ? 409 : 404).json({
      message: existing
        ? "Only a future request awaiting external confirmation can be cancelled."
        : "Appointment request not found.",
    });
  }
  return res.json({ request: publicRequest(request) });
};

module.exports = {
  cancelAppointmentRequest,
  createAppointmentRequest,
  getAppointmentRequest,
  getMyAppointmentRequests,
  publicRequest,
};
