const mongoose = require("mongoose");

const tokenCounterSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      unique: true,
    },
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TokenCounter", tokenCounterSchema);
