const mongoose = require("mongoose");

const sourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    recordId: { type: String, required: true, trim: true },
    retrievedAt: { type: Date, required: true },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "unverified"],
      default: "pending",
    },
    verifiedAt: Date,
  },
  { _id: false },
);

const doctorSchema = new mongoose.Schema({
  doctorId: { type: String, required: true, unique: true },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hospital",
    required: true,
  },
  name: { type: String, required: true },
  department: { type: String, required: true },
  specialization: { type: String, trim: true },
  source: { type: sourceSchema, required: true },
  status: {
    type: String,
    enum: ["available", "busy", "paused", "unavailable"],
    default: "unavailable",
  },
  active: { type: Boolean, default: false },
  averageConsultationTime: { type: Number, min: 1, max: 240 },
  workingDays: { type: [Number], default: undefined, validate: {
    validator: (days) => days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    message: "Working days must contain weekday numbers from 0 through 6.",
  } },
  workingHours: {
    start: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  createdAt: { type: Date, default: Date.now },
});

doctorSchema.index({ hospitalId: 1, department: 1, status: 1, active: 1 });
doctorSchema.index({ "source.verificationStatus": 1 });

module.exports = mongoose.model("Doctor", doctorSchema);
