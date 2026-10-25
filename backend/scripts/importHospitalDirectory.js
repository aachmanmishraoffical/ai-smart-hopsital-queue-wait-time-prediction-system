const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Hospital = require("../models/Hospital");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SOURCE_NAME = "National Hospital Directory (data.gov.in)";
const SOURCE_URL =
  "https://www.data.gov.in/resource/national-hospital-directory-geo-code-and-additional-parameters-updated-till-last-month";

const parseCsv = (content) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted && character === '"' && content[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const parseRetrievedAt = (value) => {
  const retrievedAt = new Date(value);
  if (!value || Number.isNaN(retrievedAt.getTime())) {
    throw new Error("Pass --retrieved-at with the source retrieval timestamp.");
  }
  return retrievedAt;
};

const normalizeRecords = (content, retrievedAt) => {
  const rows = parseCsv(content);
  const headers = rows.shift()?.map((header) => header.trim());
  const requiredHeaders = [
    "sourceRecordId",
    "hospitalName",
    "latitude",
    "longitude",
    "address",
  ];
  if (!headers || requiredHeaders.some((header) => !headers.includes(header))) {
    throw new Error(
      `CSV must contain headers: ${requiredHeaders.join(", ")}.`,
    );
  }

  const seenIds = new Set();
  const seenLocations = new Set();
  const records = [];
  let duplicateLocations = 0;

  for (const [rowIndex, values] of rows.entries()) {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has an unexpected column count.`);
    }
    const record = Object.fromEntries(
      headers.map((header, index) => [header, values[index].trim()]),
    );
    const sourceRecordId = record.sourceRecordId;
    const hospitalName = record.hospitalName;
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    let officialWebsite;
    if (record.officialWebsite) {
      try {
        officialWebsite = new URL(record.officialWebsite);
      } catch {
        throw new Error(`CSV row ${rowIndex + 2} has an invalid website URL.`);
      }
      if (!["http:", "https:"].includes(officialWebsite.protocol)) {
        throw new Error(`CSV row ${rowIndex + 2} has an invalid website URL.`);
      }
    }
    if (
      !sourceRecordId ||
      !hospitalName ||
      !record.address ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`CSV row ${rowIndex + 2} has invalid required data.`);
    }
    if (seenIds.has(sourceRecordId)) {
      throw new Error(`Duplicate sourceRecordId on CSV row ${rowIndex + 2}.`);
    }
    seenIds.add(sourceRecordId);

    const locationKey = `${hospitalName.toLowerCase().replace(/\s+/g, " ").trim()}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    if (seenLocations.has(locationKey)) {
      duplicateLocations += 1;
      continue;
    }
    seenLocations.add(locationKey);

    const hospitalId = `DGH-${crypto
      .createHash("sha256")
      .update(sourceRecordId)
      .digest("hex")
      .slice(0, 24)}`;
    records.push({
      hospitalId,
      hospitalName,
      latitude,
      longitude,
      address: record.address,
      officialWebsite: officialWebsite?.toString(),
      officialPhone: record.officialPhone || undefined,
      departments: (record.departments || "")
        .split("|")
        .map((department) => department.trim())
        .filter(Boolean),
      source: {
        name: SOURCE_NAME,
        url: SOURCE_URL,
        recordId: sourceRecordId,
        retrievedAt,
        verificationStatus: "source_listed",
      },
      participating: false,
    });
  }
  return { records, duplicateLocations };
};

const run = async () => {
  const inputPath = process.argv[2];
  const retrievedAtArgument = process.argv.find((arg) =>
    arg.startsWith("--retrieved-at="),
  );
  if (!inputPath) {
    throw new Error(
      "Usage: npm run sync:directory -- <normalized.csv> --retrieved-at=<ISO timestamp>",
    );
  }
  const retrievedAt = parseRetrievedAt(
    retrievedAtArgument?.slice("--retrieved-at=".length),
  );
  const resolvedInputPath = path.resolve(inputPath);
  const { records, duplicateLocations } = normalizeRecords(
    fs.readFileSync(resolvedInputPath, "utf8"),
    retrievedAt,
  );
  if (!records.length) throw new Error("CSV contains no importable records.");

  await connectDB();
  try {
    const result = await Hospital.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { hospitalId: record.hospitalId },
          update: {
            $set: {
              hospitalName: record.hospitalName,
              latitude: record.latitude,
              longitude: record.longitude,
              address: record.address,
              officialWebsite: record.officialWebsite,
              officialPhone: record.officialPhone,
              departments: record.departments,
              source: record.source,
            },
            $setOnInsert: { participating: false },
          },
          upsert: true,
        },
      })),
      { ordered: true },
    );
    console.log(
      `Imported ${result.upsertedCount} new and ${result.modifiedCount} updated source-listed hospitals; skipped ${duplicateLocations} duplicate locations. No records were deleted.`,
    );
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(`Hospital directory import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { normalizeRecords, parseCsv, parseRetrievedAt };
