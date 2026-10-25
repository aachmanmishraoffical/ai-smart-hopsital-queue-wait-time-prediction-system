const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    appointmentId: { type: String, required: true, unique: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    queueToken: { type: String, required: true, unique: true },
    appointmentDate: { type: Date, default: Date.now },
    appointmentSlot: { type: String, default: "Walk-in queue" },
    bookingTime: { type: Date, default: Date.now },
    checkInTime: Date,
    consultationStartTime: Date,
    consultationEndTime: Date,
    status: {
      type: String,
      enum: [
        "booked",
        "checked_in",
        "waiting",
        "in_consultation",
        "completed",
        "skipped",
        "no_show",
        "cancelled",
        "transferred",
      ],
      default: "booked",
    },
    predictedWait: { type: Number, default: null },
    actualWait: { type: Number, default: null },
    actualConsultationTime: { type: Number, default: null },
    department: { type: String },
    transferredFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital" },
    transferMetadata: {
      fromAppointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Appointment",
      },
      transferredAt: Date,
    },
  },
  { timestamps: true },
);

appointmentSchema.index({
  hospitalId: 1,
  doctorId: 1,
  appointmentDate: 1,
  status: 1,
});
appointmentSchema.index({
  userId: 1,
  doctorId: 1,
  appointmentDate: 1,
  appointmentSlot: 1,
});
appointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, appointmentSlot: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["booked", "checked_in", "waiting", "in_consultation"] },
    },
  },
);
appointmentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
