const mongoose = require("mongoose");

const digitalTokenSchema = new mongoose.Schema(
  {
    tokenCode: { type: String, required: true, unique: true, immutable: true },
    idempotencyKey: { type: String, required: true, maxlength: 128 },
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
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
      immutable: true,
    },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    requestedAt: { type: Date, default: null },
    status: { type: String, enum: ["issued"], default: "issued" },
  },
  { timestamps: true },
);

digitalTokenSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
digitalTokenSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("DigitalToken", digitalTokenSchema);
