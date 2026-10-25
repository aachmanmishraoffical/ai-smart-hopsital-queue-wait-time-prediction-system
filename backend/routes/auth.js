const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { registerUser, loginUser } = require("../controllers/authController");
const { protectUser } = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/register", asyncHandler(registerUser));
router.post("/login", asyncHandler(loginUser));
router.get("/profile", protectUser, (req, res) => res.json({ user: req.user }));

module.exports = router;
