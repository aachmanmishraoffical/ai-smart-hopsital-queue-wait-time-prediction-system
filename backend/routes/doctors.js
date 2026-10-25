const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { getDoctorSlots } = require("../controllers/hospitalController");

const router = express.Router();
router.get("/:id/slots", asyncHandler(getDoctorSlots));

module.exports = router;
