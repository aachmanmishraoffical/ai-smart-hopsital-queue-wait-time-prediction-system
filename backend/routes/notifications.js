const express = require("express");
const Notification = require("../models/Notification");
const { protectUser } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protectUser);

router.get("/", async (req, res, next) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true },
    );
    if (!notification)
      return res.status(404).json({ message: "Notification not found" });
    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
