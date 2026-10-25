const express = require("express");
const Feedback = require("../models/Feedback");
const Appointment = require("../models/Appointment");
const { protectUser } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protectUser, async (req, res, next) => {
  try {
    const { appointmentId, rating, review } = req.body;
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      userId: req.user._id,
      status: "completed",
    });
    if (!appointment)
      return res
        .status(400)
        .json({ message: "Feedback requires a completed appointment" });
    const feedback = await Feedback.create({
      appointmentId,
      rating,
      review,
      actualWaitingTime: appointment.actualWait,
    });
    res.status(201).json({ feedback });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
