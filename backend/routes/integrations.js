const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { getIntegrationStatus } = require("../controllers/integrationController");

const router = express.Router();
router.get("/status", asyncHandler(getIntegrationStatus));

module.exports = router;
