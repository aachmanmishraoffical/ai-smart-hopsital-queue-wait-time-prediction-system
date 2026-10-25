const Hospital = require("../models/Hospital");

const distanceInKilometers = (latitude, longitude, hospital) => {
  const radians = Math.PI / 180;
  const latitudeDelta = (hospital.latitude - latitude) * radians;
  const longitudeDelta = (hospital.longitude - longitude) * radians;
  const latitudeOne = latitude * radians;
  const latitudeTwo = hospital.latitude * radians;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeOne) *
      Math.cos(latitudeTwo) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const getRecommendations = async ({ lat, lon, radius = 5, page = 1, limit = 25 }) => {
  const latitudeDelta = radius / 111;
  const longitudeDelta =
    radius / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const hospitals = await Hospital.find({
    participating: true,
    "source.verificationStatus": "verified",
    latitude: { $gte: lat - latitudeDelta, $lte: lat + latitudeDelta },
    longitude: { $gte: lon - longitudeDelta, $lte: lon + longitudeDelta },
  })
    .sort({ hospitalName: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return hospitals
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
      hospital,
      distance: distanceInKilometers(lat, lon, hospital),
    }))
    .filter((item) => item.distance <= radius)
    .sort((first, second) => first.distance - second.distance);
};

module.exports = { getRecommendations };
