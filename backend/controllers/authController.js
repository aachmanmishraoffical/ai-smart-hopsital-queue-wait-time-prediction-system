const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
});

const findUserByEmail = (email) =>
  User.findOne({
    email: {
      $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    },
  });

const registerUser = async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const { name, email, password, phone } = body;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 120 ||
    typeof email !== "string" ||
    !email.trim() ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  ) {
    return res.status(400).json({
      message:
        "Name, email, and a password between 12 and 128 characters are required",
    });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ message: "Email already exists" });
  }
  const hashedPassword = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      ...(typeof phone === "string" &&
        phone.trim() &&
        { phone: phone.trim().slice(0, 32) }),
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({ message: "Email already exists" });
    }
    throw error;
  }
  res.status(201).json({
    token: generateToken(user._id, "patient"),
    user: { id: user._id, name: user.name, email: user.email },
  });
};

const loginUser = async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const { email, password } = body;
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length > 128
  ) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const user = await findUserByEmail(email.trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  res.json({
    token: generateToken(user._id, "patient"),
    user: publicUser(user),
  });
};

module.exports = { registerUser, loginUser };
