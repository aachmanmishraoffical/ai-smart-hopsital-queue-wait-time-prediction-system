const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const connectDB = require("./config/db");
const { getMongoUri } = connectDB;
const authRoutes = require("./routes/auth");
const hospitalRoutes = require("./routes/hospitals");
const doctorRoutes = require("./routes/doctors");
const appointmentRoutes = require("./routes/appointments");
const queueRoutes = require("./routes/queue");
const predictionRoutes = require("./routes/prediction");
const recommendationRoutes = require("./routes/recommendations");
const notificationRoutes = require("./routes/notifications");
const feedbackRoutes = require("./routes/feedback");
const User = require("./models/User");
const Appointment = require("./models/Appointment");
const DigitalToken = require("./models/DigitalToken");
const AppointmentRequest = require("./models/AppointmentRequest");
const tokenRoutes = require("./routes/tokens");
const appointmentRequestRoutes = require("./routes/appointmentRequests");
const predictionObservationRoutes = require("./routes/predictionObservations");
const hospitalComparisonRoutes = require("./routes/hospitalComparison");
const integrationRoutes = require("./routes/integrations");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const validateConfig = () => {
  getMongoUri();
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    /your_jwt_secret|change-this|replace-with/i.test(process.env.JWT_SECRET)
  ) {
    throw new Error(
      "Set JWT_SECRET to a unique random value of at least 32 characters.",
    );
  }
  if (allowedOrigins.length === 0) {
    throw new Error("Set FRONTEND_URL to the frontend origin.");
  }
  if (
    process.env.TRUST_PROXY_HOPS &&
    (!Number.isInteger(Number(process.env.TRUST_PROXY_HOPS)) ||
      Number(process.env.TRUST_PROXY_HOPS) < 0 ||
      Number(process.env.TRUST_PROXY_HOPS) > 10)
  ) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10.");
  }
  for (const origin of allowedOrigins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error("FRONTEND_URL must contain valid origins.");
    }
    if (parsedOrigin.origin !== origin || parsedOrigin.origin === "null") {
      throw new Error("FRONTEND_URL values must be origins without paths.");
    }
    if (
      process.env.NODE_ENV === "production" &&
      parsedOrigin.protocol !== "https:"
    ) {
      throw new Error("Production FRONTEND_URL origins must use HTTPS.");
    }
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};

const io = new Server(server, {
  cors: corsOptions,
});

app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || false);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: "unavailable",
      database: "disconnected",
    });
  }
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    return res.json({ status: "ok", database: "connected" });
  } catch {
    return res.status(503).json({
      status: "unavailable",
      database: "disconnected",
    });
  }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/tokens", rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Token request limit reached. Try again shortly." },
}));
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Request limit reached. Try again later." },
});
app.use("/api/hospitals", publicApiLimiter);
app.use("/api/recommendations", publicApiLimiter);
app.use("/api/predict", publicApiLimiter);
app.use("/api/comparisons", publicApiLimiter);
const osmProviderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Hospital provider request limit reached. Try again shortly." },
});
app.use([
  "/api/hospitals/nearby",
  "/api/hospitals/osm",
  "/api/comparisons",
], osmProviderLimiter);
app.use("/api/hospitals/geocode", rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Location search limit reached. Try again shortly." },
}));
app.use("/api/auth", authRoutes);
app.use("/api/appointment-requests", appointmentRequestRoutes);
app.use("/api/prediction-observations", predictionObservationRoutes);
app.use("/api/comparisons", hospitalComparisonRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/predict", predictionRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/tokens", tokenRoutes);

app.use(notFound);
app.use(errorHandler);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "patient") {
      return next(new Error("Authentication failed"));
    }
    const user = await User.findById(decoded.id).select("_id");
    if (!user) return next(new Error("Authentication failed"));
    socket.user = { id: user._id };
    return next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  socket.on("join-hospital", async (hospitalId) => {
    if (!mongoose.isValidObjectId(hospitalId)) {
      return socket.emit("room-denied");
    }
    const permitted = Boolean(
      await Appointment.exists({
        userId: socket.user.id,
        hospitalId,
        status: {
          $in: ["booked", "checked_in", "waiting", "in_consultation"],
        },
      }),
    );
    if (!permitted) return socket.emit("room-denied");
    socket.join(`hospital_${hospitalId}`);
  });
  socket.on("leave-hospital", (hospitalId) => {
    socket.leave(`hospital_${hospitalId}`);
  });
});

app.set("io", io);

const PORT = process.env.PORT || 5000;

const start = async () => {
  validateConfig();
  await connectDB();
  await DigitalToken.init();
  await AppointmentRequest.init();
  server.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
};

start().catch((error) => {
  console.error(`Backend startup failed: ${error.message}`);
  process.exitCode = 1;
});
