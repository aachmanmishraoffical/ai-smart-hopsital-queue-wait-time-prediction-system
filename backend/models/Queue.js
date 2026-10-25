const mongoose = require("mongoose");

const queueSchema = new mongoose.Schema(
  {
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
    currentToken: { type: String, default: "" },
    currentServingToken: { type: String, default: "" },
    tokenSequence: { type: Number, default: 0 },
    patientsWaiting: { type: Number, default: 0 },
    estimatedWait: { type: Number, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

queueSchema.index({ hospitalId: 1, doctorId: 1 }, { unique: true });

module.exports = mongoose.model("Queue", queueSchema);
