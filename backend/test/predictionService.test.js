const test = require("node:test");
const assert = require("node:assert/strict");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const Hospital = require("../models/Hospital");
const PatientWaitObservation = require("../models/PatientWaitObservation");
const Queue = require("../models/Queue");
const {
  predictSlotWait,
  predictWaitingTime,
} = require("../services/predictionService");

const originalAppointmentFind = Appointment.find;
const originalDoctorFindOne = Doctor.findOne;
const originalHospitalFindOne = Hospital.findOne;
const originalQueueFindOne = Queue.findOne;
const originalWaitObservationFind = PatientWaitObservation.find;
const originalWaitingModelUrl = process.env.WAITING_MODEL_URL;

const configureModels = ({ queue, observations, hospital, doctor }) => {
  Hospital.findOne = () => ({
    select: async () => hospital,
  });
  Doctor.findOne = () => ({
    select: async () => doctor,
  });
  Queue.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => queue,
  });
  Appointment.find = () => ({
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => observations,
  });
};

test("prediction is unavailable when a verified participating doctor is missing", async () => {
  configureModels({
    hospital: null,
    doctor: null,
    queue: null,
    observations: [],
  });

  const result = await predictWaitingTime({
    hospitalId: "hospital-id",
    doctorId: "doctor-id",
  });

  assert.equal(result.available, false);
  assert.equal(result.predictedWait, null);
  assert.equal(result.method, "unavailable");
  assert.match(result.reason, /Verified hospital and doctor/);
});

test("prediction is unavailable when recent completed observations are insufficient", async () => {
  configureModels({
    hospital: { _id: "hospital-id" },
    doctor: { _id: "doctor-id" },
    queue: { patientsWaiting: 3, updatedAt: new Date() },
    observations: Array.from({ length: 19 }, (_, index) => ({
      actualConsultationTime: 10,
      consultationEndTime: new Date(Date.now() - index * 1000),
    })),
  });

  const result = await predictWaitingTime({
    hospitalId: "hospital-id",
    doctorId: "doctor-id",
  });

  assert.equal(result.available, false);
  assert.equal(result.observationCount, 19);
  assert.match(result.reason, /At least 20 recent completed consultations/);
});

test("prediction uses a transparent recent-duration baseline and validates its output", async () => {
  configureModels({
    hospital: { _id: "hospital-id" },
    doctor: { _id: "doctor-id" },
    queue: { patientsWaiting: 3, updatedAt: new Date() },
    observations: Array.from({ length: 20 }, (_, index) => ({
      actualConsultationTime: 10,
      consultationEndTime: new Date(Date.now() - index * 1000),
    })),
  });

  const result = await predictWaitingTime({
    hospitalId: "hospital-id",
    doctorId: "doctor-id",
  });

  assert.equal(result.available, true);
  assert.equal(result.method, "recent_completed_consultation_mean");
  assert.equal(result.observationCount, 20);
  assert.equal(result.predictedWait, 30);
  assert.equal(result.uncertaintyMinutes, 0);
  assert.ok(Number.isFinite(result.predictedWait));
  assert.ok(Number.isFinite(result.predictionTimestamp.getTime()));
});

test("prediction rejects stale operational queue snapshots", async () => {
  configureModels({
    hospital: { _id: "hospital-id" },
    doctor: { _id: "doctor-id" },
    queue: { patientsWaiting: 3, updatedAt: new Date(Date.now() - 6 * 60 * 1000) },
    observations: [],
  });

  const result = await predictWaitingTime({
    hospitalId: "hospital-id",
    doctorId: "doctor-id",
  });

  assert.equal(result.available, false);
  assert.match(result.reason, /fresh operational queue snapshot/);
});

test("slot baseline requires real consent and review dates after service", async () => {
  let filter;
  Hospital.findOne = () => ({
    select: async () => ({ _id: "hospital-id" }),
  });
  PatientWaitObservation.find = (query) => {
    filter = query;
    return {
      sort() {
        return this;
      },
      limit() {
        return this;
      },
      select() {
        return this;
      },
      lean: async () => [
        {
          actualWaitMinutes: 30,
          arrivalAt: new Date(Date.now() - 60 * 60 * 1000),
          serviceStartAt: new Date(Date.now() - 30 * 60 * 1000),
          consentAt: null,
          reviewedAt: null,
        },
      ],
    };
  };
  delete process.env.WAITING_MODEL_URL;

  const result = await predictSlotWait({
    hospitalId: "hospital-id",
    department: "Cardiology",
    requestedAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    timeZone: "UTC",
  });

  assert.equal(filter.consentAt.$type, "date");
  assert.equal(filter.reviewedAt.$type, "date");
  assert.equal(result.available, false);
  assert.equal(result.observationCount, 0);
});

test.after(() => {
  Appointment.find = originalAppointmentFind;
  Doctor.findOne = originalDoctorFindOne;
  Hospital.findOne = originalHospitalFindOne;
  Queue.findOne = originalQueueFindOne;
  PatientWaitObservation.find = originalWaitObservationFind;
  if (originalWaitingModelUrl === undefined) {
    delete process.env.WAITING_MODEL_URL;
  } else {
    process.env.WAITING_MODEL_URL = originalWaitingModelUrl;
  }
});
