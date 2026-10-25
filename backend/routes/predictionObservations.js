const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { rateLimit } = require("express-rate-limit");
const { protectUser } = require("../middleware/authMiddleware");
const { createObservation } = require("../controllers/predictionObservationController");

const router = express.Router();
router.post(
  "/",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Observation submission limit reached. Try again later." },
  }),
  protectUser,
  asyncHandler(createObservation),
);

module.exports = router;
