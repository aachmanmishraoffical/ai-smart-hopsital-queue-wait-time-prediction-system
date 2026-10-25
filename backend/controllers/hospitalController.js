const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");
const Doctor = require("../models/Doctor");
const { predictWaitingTime } = require("../services/predictionService");
const osmService = require("../services/openStreetMapService");

const MAX_PAGE_SIZE = 100;
const MAX_NEARBY_RECORDS = 500;

const parseCoordinates = (query) => {
  const latitude = Number(query.lat);
  const longitude = Number(query.lon);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
};

const locationFilter = ({ latitude, longitude, radiusMeters }) => {
  const latitudeDelta = radiusMeters / 111000;
  const longitudeDelta =
    radiusMeters /
    (111000 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  return {
    latitude: {
      $gte: latitude - latitudeDelta,
      $lte: latitude + latitudeDelta,
    },
    longitude: {
      $gte: longitude - longitudeDelta,
      $lte: longitude + longitudeDelta,
    },
  };
};

const distanceInMeters = (first, second) => {
  const radians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * radians;
  const longitudeDelta = (second.longitude - first.longitude) * radians;
  const firstLatitude = first.latitude * radians;
  const secondLatitude = second.latitude * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    6371000 *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
};

const getNearbyHospitals = async (req, res) => {
  const coordinates = parseCoordinates(req.query);
  const radiusMeters = Number(req.query.radius || 5000);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 25);
  if (
    !coordinates ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0 ||
    radiusMeters > 50000 ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    return res.status(400).json({
      message:
        "Provide valid coordinates, a radius up to 50 km, and valid pagination.",
    });
  }

  const sourceFilter = {
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
    ...locationFilter({ ...coordinates, radiusMeters }),
  };
  const [hospitals, osmResult] = await Promise.all([
    Hospital.find(sourceFilter)
      .sort({ hospitalName: 1, _id: 1 })
      .limit(MAX_NEARBY_RECORDS)
      .lean(),
    osmService
      .getNearbyHospitals(
        coordinates.latitude,
        coordinates.longitude,
        radiusMeters,
      )
      .then((records) => ({ records }))
      .catch((error) => {
        console.warn(
          `OpenStreetMap nearby provider unavailable: ${
            error.message || error.name || "unknown error"
          }`,
        );
        return { error };
      }),
  ]);
  const directoryResults = hospitals
    .filter(
      (hospital) =>
        Number.isFinite(hospital.latitude) &&
        hospital.latitude >= -90 &&
        hospital.latitude <= 90 &&
        Number.isFinite(hospital.longitude) &&
        hospital.longitude >= -180 &&
        hospital.longitude <= 180,
    )
    .map((hospital) => ({
      ...hospital,
      distanceMeters: distanceInMeters(coordinates, {
        latitude: hospital.latitude,
        longitude: hospital.longitude,
      }),
    }))
    .filter((hospital) => hospital.distanceMeters <= radiusMeters)
    .map(({ distanceMeters, ...hospital }) => ({
      ...hospital,
      distance: Number((distanceMeters / 1000).toFixed(2)),
    }));
  const combined = [...directoryResults];
  for (const hospital of osmResult.records || []) {
    const normalizedName = hospital.hospitalName
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const duplicate = combined.some((record) => {
      const recordName = (record.hospitalName || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      return (
        normalizedName === recordName &&
        osmService.distanceInMeters(coordinates, {
          latitude: record.latitude,
          longitude: record.longitude,
        }) <= 50
      );
    });
    if (!duplicate) combined.push(hospital);
  }
  combined.sort((first, second) => first.distance - second.distance);
  const offset = (page - 1) * limit;
  const results = combined.slice(offset, offset + limit);

  res.json({
    hospitals: results,
    pagination: {
      page,
      limit,
      hasMore:
        combined.length > offset + limit ||
        hospitals.length === MAX_NEARBY_RECORDS,
    },
    providers: {
      directory: "available",
      openStreetMap: osmResult.error ? "unavailable" : "available",
      ...(osmResult.error && {
        openStreetMapMessage: osmResult.error.message,
      }),
    },
    availabilityNotice:
      "Directory and OpenStreetMap listings are not verification of current operation, services, doctor availability, or queue status.",
  });
};

const geocodeLocation = async (req, res) => {
  const result = await osmService.geocodeLocation(req.query.q);
  if (!result) {
    return res.status(404).json({
      message:
        "No matching location was found. Try a more specific locality or postal code.",
    });
  }
  return res.json({ location: result });
};

const getOpenStreetMapHospital = async (req, res) => {
  const hospital = await osmService.getHospitalByOsmId(
    req.params.type,
    req.params.recordId,
  );
  if (!hospital) {
    return res
      .status(404)
      .json({ message: "OpenStreetMap hospital record not found." });
  }
  return res.json({ hospital });
};

const searchHospitals = async (req, res) => {
  const searchText =
    typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const coordinates = parseCoordinates(req.query);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 25);
  const radiusMeters = Number(req.query.radius || 5000);
  if (
    !searchText ||
    !coordinates ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0 ||
    radiusMeters > 50000 ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    return res.status(400).json({
      message: "Provide a search term, valid coordinates, and valid pagination.",
    });
  }
  const escapedSearch = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const location = locationFilter({
    ...coordinates,
    radiusMeters,
  });
  const hospitals = await Hospital.find({
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
    ...location,
    $or: [
      { hospitalName: { $regex: escapedSearch, $options: "i" } },
      { address: { $regex: escapedSearch, $options: "i" } },
    ],
  })
    .sort({ hospitalName: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const results = hospitals
    .filter(
      (hospital) =>
        Number.isFinite(hospital.latitude) &&
        hospital.latitude >= -90 &&
        hospital.latitude <= 90 &&
        Number.isFinite(hospital.longitude) &&
        hospital.longitude >= -180 &&
        hospital.longitude <= 180,
    )
    .map((hospital) => ({
      ...hospital,
      distanceMeters: distanceInMeters(coordinates, {
        latitude: hospital.latitude,
        longitude: hospital.longitude,
      }),
      distance: Number(
        (
          distanceInMeters(coordinates, {
            latitude: hospital.latitude,
            longitude: hospital.longitude,
          }) / 1000
        ).toFixed(2),
      ),
    }))
    .filter((hospital) => hospital.distanceMeters <= radiusMeters)
    .map(({ distanceMeters, ...hospital }) => hospital);
  res.json({
    hospitals: results,
    pagination: { page, limit, hasMore: hospitals.length === limit },
    availabilityNotice:
      "Directory listings do not confirm current services, doctor availability, or queue status.",
  });
};

const getHospitalDetails = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Hospital not found" });
  }
  const hospital = await Hospital.findOne({
    _id: req.params.id,
    "source.verificationStatus": { $in: ["source_listed", "verified"] },
  }).lean();
  if (!hospital) {
    return res.status(404).json({ message: "Hospital not found" });
  }

  const doctors =
    hospital.participating &&
    hospital.source.verificationStatus === "verified"
    ? await Doctor.find({
        hospitalId: hospital._id,
        active: true,
        status: "available",
        "source.verificationStatus": "verified",
      })
        .sort({ department: 1, name: 1 })
        .lean()
    : [];
  const queues = await Promise.all(
    doctors.map(async (doctor) => ({
      doctor,
      prediction: await predictWaitingTime({
        hospitalId: hospital._id,
        doctorId: doctor._id,
      }),
    })),
  );
  res.json({ hospital, doctors, queues });
};

const getHospitalDoctors = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Hospital not found" });
  }
  const hospital = await Hospital.findOne({
    _id: req.params.id,
    participating: true,
    "source.verificationStatus": "verified",
  }).select("_id");
  if (!hospital) {
    return res.status(404).json({ message: "Verified participating hospital not found" });
  }
  const filter = {
    hospitalId: hospital._id,
    active: true,
    status: "available",
    "source.verificationStatus": "verified",
  };
  if (typeof req.query.department === "string" && req.query.department.trim()) {
    filter.department = req.query.department.trim().slice(0, 120);
  }
  const doctors = await Doctor.find(filter)
    .sort({ department: 1, name: 1 })
    .limit(MAX_PAGE_SIZE)
    .lean();
  res.json({
    doctors,
    availabilityNotice:
      "Only provider records verified against their cited source are returned.",
  });
};

const getHospitalDepartments = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Hospital not found" });
  }
  const hospital = await Hospital.findOne({
    _id: req.params.id,
    participating: true,
    "source.verificationStatus": "verified",
  }).select("departments");
  if (!hospital) {
    return res.status(404).json({ message: "Verified participating hospital not found" });
  }
  const doctorDepartments = await Doctor.distinct("department", {
    hospitalId: hospital._id,
    active: true,
    status: "available",
    "source.verificationStatus": "verified",
  });
  const departments = [
    ...new Set([...(hospital.departments || []), ...doctorDepartments]),
  ]
    .filter(Boolean)
    .sort();
  res.json({ departments });
};

const getDoctorSlots = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Doctor not found" });
  }
  const doctor = await Doctor.findOne({
    _id: req.params.id,
    active: true,
    status: "available",
    "source.verificationStatus": "verified",
  }).select("_id");
  if (!doctor) return res.status(404).json({ message: "Doctor not found" });
  return res.status(503).json({
    message:
      "Published appointment availability is not connected for this provider.",
    availability: "unavailable",
  });
};

module.exports = {
  searchHospitals,
  getNearbyHospitals,
  getHospitalDetails,
  getHospitalDoctors,
  getHospitalDepartments,
  geocodeLocation,
  getOpenStreetMapHospital,
  getDoctorSlots,
};
