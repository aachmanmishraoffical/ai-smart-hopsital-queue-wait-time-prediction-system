const Appointment = require("../models/Appointment");
const Hospital = require("../models/Hospital");
const Doctor = require("../models/Doctor");
const Queue = require("../models/Queue");
const PatientWaitObservation = require("../models/PatientWaitObservation");
const { requestModelPrediction } = require("./predictionModelClient");

const MIN_OBSERVATIONS = 20;
const MAX_OBSERVATION_AGE_DAYS = 30;
const MAX_WAIT_OBSERVATION_AGE_DAYS = 365;

const unavailable = (reason, predictionTimestamp, extra = {}) => ({
  available: false,
  predictedWait: null,
  method: "unavailable",
  reason,
  predictionTimestamp,
  sourceFreshness: null,
  uncertaintyMinutes: null,
  observationCount: 0,
  ...extra,
});

const predictWaitingTime = async ({ hospitalId, doctorId, patientsAhead }) => {
  const predictionTimestamp = new Date();
  const [hospital, doctor] = await Promise.all([
    Hospital.findOne({
      _id: hospitalId,
      participating: true,
      "source.verificationStatus": "verified",
    }).select("_id"),
    Doctor.findOne({
      _id: doctorId,
      hospitalId,
      active: true,
      status: "available",
      "source.verificationStatus": "verified",
    }).select("_id"),
  ]);
  if (!hospital || !doctor) {
    return unavailable(
      "Verified hospital and doctor records are required.",
      predictionTimestamp,
    );
  }

  const queue = await Queue.findOne({ hospitalId, doctorId })
    .select("patientsWaiting updatedAt")
    .lean();
  const queueMaxAgeMs = 5 * 60 * 1000;
  const queueUpdatedAt = queue?.updatedAt
    ? new Date(queue.updatedAt)
    : null;
  if (
    !queue ||
    !Number.isFinite(queue.patientsWaiting) ||
    queue.patientsWaiting < 0 ||
    !Number.isInteger(queue.patientsWaiting) ||
    !queueUpdatedAt ||
    !Number.isFinite(queueUpdatedAt.getTime()) ||
    predictionTimestamp - queueUpdatedAt > queueMaxAgeMs ||
    predictionTimestamp - queueUpdatedAt < 0
  ) {
    return unavailable(
      "A fresh operational queue snapshot is not available.",
      predictionTimestamp,
      {
        sourceFreshness: {
          queueUpdatedAt: queue?.updatedAt || null,
          consultationObservedAt: null,
        },
      },
    );
  }
  const queuePosition =
    patientsAhead === undefined ? queue.patientsWaiting : patientsAhead;
  if (!Number.isInteger(queuePosition) || queuePosition < 0) {
    return unavailable(
      "A valid queue position is not available.",
      predictionTimestamp,
      { sourceFreshness: queue.updatedAt },
    );
  }

  const observationCutoff = new Date(predictionTimestamp);
  observationCutoff.setDate(
    observationCutoff.getDate() - MAX_OBSERVATION_AGE_DAYS,
  );
  const observations = await Appointment.find({
    hospitalId,
    doctorId,
    status: "completed",
    consultationEndTime: { $gte: observationCutoff, $lte: predictionTimestamp },
    actualConsultationTime: { $gt: 0, $lte: 1440 },
  })
    .sort({ consultationEndTime: -1 })
    .limit(MIN_OBSERVATIONS)
    .select("actualConsultationTime consultationEndTime")
    .lean();

  const validObservations = observations.filter(
    (item) =>
      Number.isFinite(item.actualConsultationTime) &&
      item.actualConsultationTime > 0 &&
      item.actualConsultationTime <= 1440,
  );
  if (validObservations.length < MIN_OBSERVATIONS) {
    return {
      ...unavailable(
        `At least ${MIN_OBSERVATIONS} recent completed consultations are required.`,
        predictionTimestamp,
        {
          sourceFreshness: {
            queueUpdatedAt: queue.updatedAt,
            consultationObservedAt:
              observations[0]?.consultationEndTime || null,
          },
        },
      ),
      observationCount: validObservations.length,
    };
  }

  const durations = validObservations.map((item) => item.actualConsultationTime);
  const mean =
    durations.reduce((total, duration) => total + duration, 0) /
    durations.length;
  const variance =
    durations.reduce((total, duration) => total + (duration - mean) ** 2, 0) /
    (durations.length - 1);
  const sourceFreshness = validObservations[0].consultationEndTime;
  const predictedWait = Math.round(queuePosition * mean);
  const uncertaintyMinutes = Math.ceil(
    1.96 * Math.sqrt(variance) * Math.sqrt(queuePosition),
  );
  if (
    !Number.isFinite(predictedWait) ||
    predictedWait < 0 ||
    !Number.isFinite(uncertaintyMinutes)
  ) {
    return unavailable(
      "A finite waiting-time estimate could not be calculated from the available records.",
      predictionTimestamp,
      {
        sourceFreshness: {
          queueUpdatedAt: queue.updatedAt,
          consultationObservedAt: sourceFreshness,
        },
      },
    );
  }
  return {
    available: true,
    predictedWait,
    method: "recent_completed_consultation_mean",
    reason: null,
    predictionTimestamp,
    sourceFreshness: {
      queueUpdatedAt: queue.updatedAt,
      consultationObservedAt: sourceFreshness,
    },
    uncertaintyMinutes,
    observationCount: validObservations.length,
    patientsAhead: queuePosition,
  };
};

const median = (values) => {
  const ordered = [...values].sort((first, second) => first - second);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
};

const unavailableSlotPrediction = (reason, extra = {}) => ({
  available: false,
  predictedWaitMinutes: null,
  method: "unavailable",
  reason,
  generatedAt: new Date(),
  dataFreshness: null,
  observationCount: 0,
  modelVersion: null,
  ...extra,
});

const predictSlotWait = async (
  { hospitalId, department, requestedAt, timeZone },
  fetchImpl = fetch,
) => {
  const hospital = await Hospital.findOne({
    _id: hospitalId,
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
  }).select("_id");
  if (!hospital) {
    return unavailableSlotPrediction(
      "A source-attributed hospital record is required.",
    );
  }

  const now = new Date();
  const observationCutoff = new Date(now);
  observationCutoff.setDate(
    observationCutoff.getDate() - MAX_WAIT_OBSERVATION_AGE_DAYS,
  );
  const observations = await PatientWaitObservation.find({
    hospitalId,
    department,
    consentAt: { $type: "date", $lte: now },
    reviewStatus: "approved",
    reviewedAt: { $type: "date", $lte: now },
    arrivalAt: { $gte: observationCutoff, $lte: now },
    actualWaitMinutes: { $gte: 0, $lte: 1440 },
  })
    .sort({ arrivalAt: -1 })
    .limit(500)
    .select("actualWaitMinutes arrivalAt serviceStartAt consentAt reviewedAt")
    .lean();
  const validObservations = observations.filter(
    (observation) =>
      Number.isFinite(observation.actualWaitMinutes) &&
      observation.actualWaitMinutes >= 0 &&
      observation.actualWaitMinutes <= 1440 &&
      observation.consentAt instanceof Date &&
      observation.consentAt <= now &&
      observation.reviewedAt instanceof Date &&
      observation.serviceStartAt instanceof Date &&
      observation.reviewedAt >= observation.serviceStartAt &&
      observation.reviewedAt <= now,
  );

  let modelResult = null;
  if (process.env.WAITING_MODEL_URL) {
    try {
      modelResult = await requestModelPrediction(
        {
          hospitalId: String(hospitalId),
          department,
          requestedAt: requestedAt.toISOString(),
          timeZone,
        },
        fetchImpl,
      );
    } catch (error) {
      console.warn(
        `Waiting-time model unavailable: ${error.message || error.name}`,
      );
    }
  }

  if (
    modelResult?.available === true &&
    Number.isFinite(modelResult.predictedWaitMinutes) &&
    modelResult.predictedWaitMinutes >= 0
  ) {
    return {
      ...modelResult,
      dataFreshness:
        modelResult.dataFreshness ||
        validObservations[0]?.arrivalAt ||
        null,
    };
  }

  if (validObservations.length < MIN_OBSERVATIONS) {
    return unavailableSlotPrediction(
      modelResult?.reason ||
        `At least ${MIN_OBSERVATIONS} reviewed observations for this hospital and department are required.`,
      {
        observationCount: validObservations.length,
        dataFreshness: validObservations[0]?.arrivalAt || null,
      },
    );
  }

  return {
    available: true,
    predictedWaitMinutes: Math.round(
      median(validObservations.map((observation) => observation.actualWaitMinutes)),
    ),
    method: "historical_median_baseline",
    reason: null,
    generatedAt: new Date(),
    dataFreshness: validObservations[0].arrivalAt,
    observationCount: validObservations.length,
    modelVersion: null,
  };
};

module.exports = {
  MIN_OBSERVATIONS,
  predictWaitingTime,
  predictSlotWait,
};
