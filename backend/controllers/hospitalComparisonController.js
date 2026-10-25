const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");
const Doctor = require("../models/Doctor");
const osmService = require("../services/openStreetMapService");
const { predictSlotWait } = require("../services/predictionService");
const { getBookingCapabilities } = require("../services/bookingProviderRegistry");

const MAX_COMPARISON_RESULTS = 25;

const isTimeZone = (value) => {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const getNearbyComparison = async (req, res) => {
  const { lat, lon, radius = "5000", department, requestedAt, timeZone } =
    req.query;
  const latitude = Number(lat);
  const longitude = Number(lon);
  const radiusMeters = Number(radius);
  const requestedDate =
    typeof requestedAt === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(requestedAt)
      ? new Date(requestedAt)
      : null;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0 ||
    radiusMeters > 50000 ||
    typeof department !== "string" ||
    !department.trim() ||
    department.trim().length > 120 ||
    !requestedDate ||
    !Number.isFinite(requestedDate.getTime()) ||
    requestedDate <= new Date() ||
    !isTimeZone(timeZone)
  ) {
    return res.status(400).json({
      message:
        "Provide valid coordinates, radius, requested department, future date/time, and timezone.",
    });
  }

  const latitudeDelta = radiusMeters / 111000;
  const longitudeDelta =
    radiusMeters /
    (111000 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  const hospitals = await Hospital.find({
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
    latitude: {
      $gte: latitude - latitudeDelta,
      $lte: latitude + latitudeDelta,
    },
    longitude: {
      $gte: longitude - longitudeDelta,
      $lte: longitude + longitudeDelta,
    },
  })
    .limit(500)
    .lean();

  let osmHospitals = [];
  let osmStatus = "available";
  try {
    osmHospitals = await osmService.getNearbyHospitals(
      latitude,
      longitude,
      radiusMeters,
    );
  } catch (error) {
    osmStatus = "unavailable";
    console.warn(
      `OpenStreetMap comparison provider unavailable: ${
        error.message || error.name || "unknown error"
      }`,
    );
  }

  const radians = Math.PI / 180;
  const distanceMeters = (hospitalLatitude, hospitalLongitude) => {
    const latitudeDeltaRadians = (hospitalLatitude - latitude) * radians;
    const longitudeDeltaRadians = (hospitalLongitude - longitude) * radians;
    const firstLatitude = latitude * radians;
    const secondLatitude = hospitalLatitude * radians;
    const haversine =
      Math.sin(latitudeDeltaRadians / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDeltaRadians / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };
  const directory = hospitals
    .filter(
      (hospital) =>
        Number.isFinite(hospital.latitude) &&
        Number.isFinite(hospital.longitude) &&
        distanceMeters(hospital.latitude, hospital.longitude) <= radiusMeters,
    )
    .map((hospital) => ({
      ...hospital,
      distanceMeters: distanceMeters(hospital.latitude, hospital.longitude),
    }));
  const results = [...directory];
  for (const hospital of osmHospitals) {
    const duplicate = results.some(
      (record) =>
        record.hospitalName.trim().toLowerCase() ===
          hospital.hospitalName.trim().toLowerCase() &&
        distanceMeters(hospital.latitude, hospital.longitude) <= 50,
    );
    if (!duplicate) {
      results.push({
        ...hospital,
        distanceMeters: distanceMeters(hospital.latitude, hospital.longitude),
      });
    }
  }

  const compared = await Promise.all(
    results
      .sort((first, second) => first.distanceMeters - second.distanceMeters)
      .slice(0, MAX_COMPARISON_RESULTS)
      .map(async (hospital) => {
        const isDatabaseRecord = mongoose.isValidObjectId(hospital._id);
        const departmentListed =
          (hospital.departments || []).some(
            (item) =>
              typeof item === "string" &&
              item.trim().toLowerCase() === department.trim().toLowerCase(),
          );
        let verifiedProvider = false;
        let prediction = {
          available: false,
          predictedWaitMinutes: null,
          method: "unavailable",
          reason: "No reviewed waiting-time data is available for this listing.",
        };
        let booking = {
          status: "unavailable",
          available: false,
          message:
            "No hospital-authorized booking integration is configured.",
        };

        if (isDatabaseRecord) {
          const [provider, estimate, capabilities] = await Promise.all([
            hospital.participating === true &&
            hospital.source?.verificationStatus === "verified"
              ? Doctor.exists({
                  hospitalId: hospital._id,
                  department: new RegExp(
                    `^${department.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                    "i",
                  ),
                  active: true,
                  status: "available",
                  "source.verificationStatus": "verified",
                })
              : null,
            predictSlotWait({
              hospitalId: hospital._id,
              department: department.trim(),
              requestedAt: requestedDate,
              timeZone,
            }),
            getBookingCapabilities(hospital),
          ]);
          verifiedProvider = Boolean(provider);
          prediction = estimate;
          booking = capabilities;
        }

        return {
          hospitalId: isDatabaseRecord ? String(hospital._id) : null,
          hospitalName: hospital.hospitalName,
          address: hospital.address,
          distanceKm: Number((hospital.distanceMeters / 1000).toFixed(2)),
          source: hospital.source,
          participating:
            isDatabaseRecord &&
            hospital.participating === true &&
            hospital.source?.verificationStatus === "verified",
          department: {
            requested: department.trim(),
            evidence: verifiedProvider
              ? "verified_provider_record"
              : departmentListed
                ? "directory_listing_only"
                : "not_verified",
            available: verifiedProvider,
          },
          requestedAt: requestedDate,
          timeZone,
          appointmentAvailability: booking,
          prediction,
        };
      }),
  );

  return res.json({
    request: {
      department: department.trim(),
      requestedAt: requestedDate,
      timeZone,
      radiusMeters,
    },
    hospitals: compared,
    providers: { directory: "available", openStreetMap: osmStatus },
    notice:
      "Hospitals are sorted by distance. Listed departments are not proof of service or appointment availability. No hospital has received an appointment request through comparison.",
  });
};

module.exports = { getNearbyComparison };
