const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  bookAppointment,
  getAppointmentStatus,
  getUserAppointments,
  updateAppointmentStatus,
  transferAppointment,
} = require("../controllers/appointmentController");
const { protectUser } = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/", protectUser, asyncHandler(bookAppointment));
router.get("/my", protectUser, asyncHandler(getUserAppointments));
router.get("/history", protectUser, asyncHandler(getUserAppointments));
router.get("/:token/status", protectUser, asyncHandler(getAppointmentStatus));
router.put("/:id/status", protectUser, asyncHandler(updateAppointmentStatus));
router.post("/:id/transfer", protectUser, asyncHandler(transferAppointment));

module.exports = router;
