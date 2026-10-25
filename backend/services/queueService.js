const Appointment = require("../models/Appointment");
const Queue = require("../models/Queue");
const Hospital = require("../models/Hospital");
const TokenCounter = require("../models/TokenCounter");

const buildQueueToken = async (hospitalId, session = null) => {
  const hospitalQuery = Hospital.findById(hospitalId).select("tokenPrefix");
  if (session) hospitalQuery.session(session);
  const hospital = await hospitalQuery;
  const counter = await TokenCounter.findOneAndUpdate(
    { hospitalId },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, ...(session && { session }) },
  );
  return `${hospital?.tokenPrefix || "HSP"}-${String(counter.sequence).padStart(3, "0")}`;
};

const updateQueueStats = async (
  hospitalId,
  doctorId,
  appointmentDate = new Date(),
) => {
  const date = new Date(appointmentDate);
  const dayStart = new Date(date.setHours(0, 0, 0, 0));
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const patientsWaiting = await Appointment.countDocuments({
    hospitalId,
    doctorId,
    appointmentDate: { $gte: dayStart, $lt: dayEnd },
    status: { $in: ["checked_in", "waiting"] },
  });
  const serving = await Appointment.findOne({
    hospitalId,
    doctorId,
    appointmentDate: { $gte: dayStart, $lt: dayEnd },
    status: "in_consultation",
  }).sort({ consultationStartTime: -1 });
  const queue = await Queue.findOneAndUpdate(
    { hospitalId, doctorId },
    {
      patientsWaiting,
      currentToken: serving?.queueToken || "",
      currentServingToken: serving?.queueToken || "",
      estimatedWait: null,
      updatedAt: new Date(),
    },
    { new: true, upsert: true },
  );
  return queue;
};

const ACTIVE_STATUSES = ["booked", "checked_in", "waiting", "in_consultation"];
const STATUS_TRANSITIONS = {
  booked: ["checked_in", "waiting", "cancelled", "transferred", "no_show"],
  checked_in: ["waiting", "in_consultation", "cancelled", "no_show"],
  waiting: ["in_consultation", "skipped", "cancelled", "no_show"],
  in_consultation: ["completed", "skipped"],
  completed: [],
  skipped: [],
  no_show: [],
  cancelled: [],
  transferred: [],
};

const getQueueAppointments = async (appointment) =>
  Appointment.find({
    hospitalId: appointment.hospitalId,
    doctorId: appointment.doctorId,
    appointmentDate: {
      $gte: new Date(
        new Date(appointment.appointmentDate).setHours(0, 0, 0, 0),
      ),
      $lt: new Date(
        new Date(appointment.appointmentDate).setHours(24, 0, 0, 0),
      ),
    },
    status: { $in: ["checked_in", "waiting", "in_consultation"] },
  }).sort({ checkInTime: 1, bookingTime: 1 });

module.exports = {
  ACTIVE_STATUSES,
  STATUS_TRANSITIONS,
  buildQueueToken,
  getQueueAppointments,
  updateQueueStats,
};
