const mongoose = require("mongoose");

const sourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    recordId: { type: String, required: true, trim: true },
    retrievedAt: { type: Date, required: true },
    verificationStatus: {
      type: String,
      enum: ["source_listed", "verified", "unverified"],
      default: "source_listed",
    },
    verifiedAt: Date,
  },
  { _id: false },
);

const hospitalSchema = new mongoose.Schema({
  hospitalId: { type: String, required: true, unique: true },
  hospitalName: { type: String, required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  address: { type: String, required: true },
  officialWebsite: { type: String, trim: true },
  officialPhone: { type: String, trim: true },
  source: { type: sourceSchema, required: true },
  specialities: [{ type: String }],
  departments: [{ type: String }],
  participating: { type: Boolean, default: false },
  bookingIntegration: {
    providerKey: { type: String, trim: true, maxlength: 120 },
    authorizationStatus: {
      type: String,
      enum: ["not_configured", "pending", "authorized", "revoked"],
      default: "not_configured",
    },
    authorizationEvidence: { type: String, trim: true, maxlength: 1000 },
    authorizedAt: Date,
  },
  tokenPrefix: { type: String, default: "HSP" },
  createdAt: { type: Date, default: Date.now },
});

hospitalSchema.index({ latitude: 1, longitude: 1 });
hospitalSchema.index({ participating: 1, "source.verificationStatus": 1 });

module.exports = mongoose.model("Hospital", hospitalSchema);
