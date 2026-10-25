const Notification = require("../models/Notification");

const createNotification = async ({
  userId,
  title,
  message,
  type = "info",
  io,
  hospitalId,
}) => {
  const notification = await Notification.create({
    userId,
    title,
    message,
    type,
  });
  if (io && hospitalId) {
    io.to(`hospital_${hospitalId}`).emit("notificationReceived", {
      notification,
    });
  }
  return notification;
};

module.exports = { createNotification };
