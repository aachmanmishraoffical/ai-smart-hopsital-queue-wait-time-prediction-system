const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { protectUser } = require("../middleware/authMiddleware");
const {
  createToken,
  getMyTokens,
  getMyToken,
} = require("../controllers/tokenController");

const router = express.Router();
router.use(protectUser);
router.post("/", asyncHandler(createToken));
router.get("/my", asyncHandler(getMyTokens));
router.get("/:tokenCode", asyncHandler(getMyToken));

module.exports = router;
