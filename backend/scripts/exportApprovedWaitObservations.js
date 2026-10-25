const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const PatientWaitObservation = require("../models/PatientWaitObservation");

const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

const exportApprovedWaitObservations = async (outputPath) => {
  if (!outputPath) {
    throw new Error(
      "Provide an explicit output CSV path. No patient-level identity is exported.",
    );
  }
  await connectDB();
  const observations = await PatientWaitObservation.find({
    reviewStatus: "approved",
    consentAt: { $type: "date", $lte: new Date() },
    reviewedAt: { $type: "date", $lte: new Date() },
  })
    .sort({ arrivalAt: 1 })
    .select(
      "_id hospitalId department arrivalAt serviceStartAt timeZone consentAt consentVersion source reviewStatus reviewedAt",
    )
    .lean();

  const fields = [
    "observation_id",
    "hospital_id",
    "department",
    "arrival_at",
    "service_start_at",
    "time_zone",
    "consent",
    "consent_version",
    "review_status",
    "reviewed_at",
    "source",
  ];
  const rows = observations.map((item) => ({
    observation_id: item._id,
    hospital_id: item.hospitalId,
    department: item.department,
    arrival_at: item.arrivalAt.toISOString(),
    service_start_at: item.serviceStartAt.toISOString(),
    time_zone: item.timeZone,
    consent: Boolean(item.consentAt),
    consent_version: item.consentVersion,
    review_status: item.reviewStatus,
    reviewed_at: item.reviewedAt.toISOString(),
    source: item.source,
  }));
  const contents = [
    fields.join(","),
    ...rows.map((row) => fields.map((field) => escapeCsv(row[field])).join(",")),
  ].join("\r\n");
  const resolvedPath = path.resolve(outputPath);
  await fs.writeFile(resolvedPath, `${contents}\r\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(
    `Exported ${rows.length} reviewed observations to ${resolvedPath}.`,
  );
};

exportApprovedWaitObservations(process.argv[2])
  .catch((error) => {
    console.error(`Observation export failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
