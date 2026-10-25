const mongoose = require("mongoose");

const hospitalSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    sourceName: { type: String, required: true, trim: true, maxlength: 120 },
    sourceUrl: { type: String, required: true, trim: true, maxlength: 1000 },
    sourceRecordId: { type: String, required: true, trim: true, maxlength: 200 },
    sourceRetrievedAt: { type: Date, required: true },
    verificationStatus: {
      type: String,
      enum: ["source_listed", "verified"],
      required: true,
    },
  },
  { _id: false },
);

const appointmentRequestSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, immutable: true },
    idempotencyKey: {
      type: String,
      required: true,
      maxlength: 128,
      immutable: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      immutable: true,
    },
    hospitalSnapshot: { type: hospitalSnapshotSchema, required: true },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    requestedAt: { type: Date, required: true },
    timeZone: { type: String, required: true, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ["pending_external_confirmation", "cancelled"],
      default: "pending_external_confirmation",
    },
    patientAcknowledgedNotSent: { type: Boolean, required: true },
    cancelledAt: Date,
  },
  { timestamps: true },
);

appointmentRequestSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true },
);
appointmentRequestSchema.index({ userId: 1, createdAt: -1 });
appointmentRequestSchema.index({ hospitalId: 1, requestedAt: 1, status: 1 });

module.exports = mongoose.model("AppointmentRequest", appointmentRequestSchema);
