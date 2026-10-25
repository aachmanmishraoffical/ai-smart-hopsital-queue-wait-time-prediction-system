const mongoose = require("mongoose");

const patientWaitObservationSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      immutable: true,
    },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    arrivalAt: { type: Date, required: true, immutable: true },
    serviceStartAt: { type: Date, required: true, immutable: true },
    actualWaitMinutes: { type: Number, required: true, min: 0, max: 1440 },
    timeZone: { type: String, required: true, trim: true, maxlength: 100 },
    consentAt: { type: Date, required: true, immutable: true },
    consentVersion: { type: String, required: true, immutable: true },
    source: {
      type: String,
      enum: ["anonymous_patient_report"],
      default: "anonymous_patient_report",
      immutable: true,
    },
    reviewStatus: {
      type: String,
      enum: ["pending_review", "approved", "rejected"],
      default: "pending_review",
    },
    reviewedAt: Date,
  },
  { timestamps: true },
);

patientWaitObservationSchema.index({
  hospitalId: 1,
  department: 1,
  reviewStatus: 1,
  arrivalAt: -1,
});

module.exports = mongoose.model(
  "PatientWaitObservation",
  patientWaitObservationSchema,
);
