const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { getNearbyComparison } = require("../controllers/hospitalComparisonController");

const router = express.Router();
router.get("/nearby", asyncHandler(getNearbyComparison));

module.exports = router;
