const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
    required: true,
  },
  rating: { type: Number, min: 1, max: 5, required: true },
  actualWaitingTime: { type: Number, default: 0 },
  review: { type: String },
  createdAt: { type: Date, default: Date.now },
});

feedbackSchema.index({ appointmentId: 1 }, { unique: true });

module.exports = mongoose.model("Feedback", feedbackSchema);
