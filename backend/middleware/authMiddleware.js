const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protectUser = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: no token provided" });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized token invalid" });
  }
  if (decoded.role !== "patient") {
    return res.status(401).json({ message: "Unauthorized token invalid" });
  }
  try {
    req.user = await User.findById(decoded.id).select("-password");
  } catch (error) {
    return next(error);
  }
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized token invalid" });
  }
  return next();
};

module.exports = { protectUser };
