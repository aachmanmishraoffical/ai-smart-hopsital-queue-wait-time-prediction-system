const express = require("express");
const { getRecommendations } = require("../services/recommendationService");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radius = Number(req.query.radius || 5);
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 25);
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lon) ||
      lon < -180 ||
      lon > 180 ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      radius > 50 ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res
        .status(400)
        .json({ message: "Valid location, radius, and pagination are required" });
    }
    const recommendations = await getRecommendations({
      lat,
      lon,
      radius,
      page,
      limit,
    });
    res.json({
      recommendations,
      pagination: { page, limit, hasMore: recommendations.length === limit },
      ranking: "distance_only",
      availabilityNotice:
        "No availability, doctor, or waiting-time information is inferred from a directory listing.",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
