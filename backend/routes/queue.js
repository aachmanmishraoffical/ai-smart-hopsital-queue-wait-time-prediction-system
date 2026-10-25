const express = require("express");
const mongoose = require("mongoose");
const Queue = require("../models/Queue");
const Hospital = require("../models/Hospital");
const asyncHandler = require("../middleware/asyncHandler");
const router = express.Router();

router.get("/:hospitalId", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.hospitalId)) {
    return res.status(404).json({ message: "Queue not found" });
  }
  const hospital = await Hospital.findOne({
    _id: req.params.hospitalId,
    participating: true,
    "source.verificationStatus": "verified",
  }).select("_id");
  if (!hospital) {
    return res.status(404).json({ message: "Queue not found" });
  }
  const queue = await Queue.findOne({
    hospitalId: hospital._id,
  })
    .populate({
      path: "doctorId",
      match: { "source.verificationStatus": "verified", active: true },
      select: "name department source",
    })
    .lean();
  if (!queue || !queue.doctorId) {
    return res.status(404).json({ message: "Queue not found" });
  }
  res.json({
    queue: { ...queue, estimatedWait: null },
    availability: "operational_queue_only",
  });
}));

module.exports = router;
