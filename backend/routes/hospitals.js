const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const {
  searchHospitals,
  getNearbyHospitals,
  getHospitalDetails,
  getHospitalDoctors,
  getHospitalDepartments,
  geocodeLocation,
  getOpenStreetMapHospital,
} = require("../controllers/hospitalController");
const router = express.Router();

router.get("/search", asyncHandler(searchHospitals));
router.get("/nearby", asyncHandler(getNearbyHospitals));
router.get("/geocode", asyncHandler(geocodeLocation));
router.get(
  "/osm/:type/:recordId",
  asyncHandler(getOpenStreetMapHospital),
);
router.get("/:id/departments", asyncHandler(getHospitalDepartments));
router.get("/:id/doctors", asyncHandler(getHospitalDoctors));
router.get("/:id", asyncHandler(getHospitalDetails));

module.exports = router;
