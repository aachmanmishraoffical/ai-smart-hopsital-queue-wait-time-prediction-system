const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { protectUser } = require("../middleware/authMiddleware");
const { rateLimit } = require("express-rate-limit");
const {
  cancelAppointmentRequest,
  createAppointmentRequest,
  getAppointmentRequest,
  getMyAppointmentRequests,
} = require("../controllers/appointmentRequestController");

const router = express.Router();
router.use(protectUser);
router.post(
  "/",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Appointment request limit reached. Try again later." },
  }),
  asyncHandler(createAppointmentRequest),
);
router.get("/my", asyncHandler(getMyAppointmentRequests));
router.get("/:reference", asyncHandler(getAppointmentRequest));
router.post("/:reference/cancel", asyncHandler(cancelAppointmentRequest));

module.exports = router;
