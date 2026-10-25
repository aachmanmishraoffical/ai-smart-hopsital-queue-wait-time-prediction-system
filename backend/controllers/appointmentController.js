const Appointment = require("../models/Appointment");
const Queue = require("../models/Queue");
const {
  getQueueAppointments,
  STATUS_TRANSITIONS,
  updateQueueStats,
} = require("../services/queueService");
const { predictWaitingTime } = require("../services/predictionService");
const { createNotification } = require("../services/notificationService");

const bookAppointment = async (req, res) =>
  res.status(503).json({
    message:
      "Appointment booking is unavailable because no participating hospital scheduling integration is configured.",
    booking: "unavailable",
  });

const getAppointmentStatus = async (req, res) => {
  const appointment = await Appointment.findOne({
    queueToken: req.params.token,
    userId: req.user._id,
  }).populate("doctorId hospitalId");
  if (!appointment) {
    return res.status(404).json({ message: "Appointment not found" });
  }
  const queue = await Queue.findOne({
    hospitalId: appointment.hospitalId,
    doctorId: appointment.doctorId,
  });
  const queueAppointments = await getQueueAppointments(appointment);
  const appointmentIndex = queueAppointments.findIndex(
    (item) => String(item._id) === String(appointment._id),
  );
  const isInLiveQueue = appointmentIndex >= 0;
  const patientsAhead = isInLiveQueue ? appointmentIndex : null;
  const wait = await predictWaitingTime({
    hospitalId: appointment.hospitalId._id,
    doctorId: appointment.doctorId._id,
    patientsAhead,
  });
  const currentToken = queue?.currentServingToken || queue?.currentToken || null;
  res.json({
    appointment,
    currentToken,
    yourToken: appointment.queueToken,
    patientsAhead,
    estimatedWait: wait.available ? wait.predictedWait : null,
    prediction: wait,
    currentQueueSize: queueAppointments.length,
    queuePosition: isInLiveQueue ? patientsAhead + 1 : null,
    doctorStatus: appointment.doctorId.status,
    progress: null,
  });
};

const getUserAppointments = async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 25);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return res.status(400).json({ message: "Invalid pagination." });
  }
  const filter = {
    userId: req.user._id,
  };
  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ bookingTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("hospitalId doctorId"),
    Appointment.countDocuments(filter),
  ]);
  res.json({ appointments, pagination: { page, limit, total } });
};

const updateAppointmentStatus = async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      appointmentId: req.params.id,
      userId: req.user._id,
    });
    if (!appointment)
      return res.status(404).json({ message: "Appointment not found" });
    const nextStatus = req.body.status;
    if (nextStatus !== "cancelled") {
      return res.status(403).json({
        message: "Only hospital staff can update queue status.",
      });
    }
    if (!STATUS_TRANSITIONS[appointment.status]?.includes(nextStatus)) {
      return res.status(400).json({
        message: `Cannot change ${appointment.status} to ${nextStatus}`,
      });
    }
    appointment.status = nextStatus;
    await appointment.save();
    await updateQueueStats(
      appointment.hospitalId,
      appointment.doctorId,
      appointment.appointmentDate,
    );
    await createNotification({
      userId: req.user._id,
      title: "Appointment updated",
      message: `Your appointment is now ${nextStatus.replace("_", " ")}.`,
      type: "queue",
      io: req.app.get("io"),
      hospitalId: appointment.hospitalId,
    });
    req.app
      .get("io")
      ?.to(`hospital_${appointment.hospitalId}`)
      .emit("queue-updated", {
        appointmentId: appointment.appointmentId,
        status: appointment.status,
      });
    res.json({ appointment });
  } catch (error) {
    next(error);
  }
};

const transferAppointment = async (req, res) =>
  res.status(503).json({
    message:
      "Appointment transfer is unavailable because no participating hospital scheduling integration is configured.",
    transfer: "unavailable",
  });

module.exports = {
  bookAppointment,
  getAppointmentStatus,
  getUserAppointments,
  updateAppointmentStatus,
  transferAppointment,
};
