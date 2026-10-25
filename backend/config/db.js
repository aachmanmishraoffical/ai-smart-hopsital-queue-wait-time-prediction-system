const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const getMongoUri = () => {
  const mongoUri = process.env.MONGO_URI;
  const mongodbUri = process.env.MONGODB_URI;

  if (mongoUri && mongodbUri && mongoUri !== mongodbUri) {
    throw new Error("Set only one of MONGO_URI or MONGODB_URI.");
  }

  const uri = mongodbUri || mongoUri;
  if (!uri) {
    throw new Error("MONGODB_URI or MONGO_URI must be configured.");
  }
  return uri;
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(getMongoUri());
    await conn.connection.db.admin().command({ ping: 1 });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    const errorName = error.name || "Error";
    const errorCode = error.code ? `, code ${error.code}` : "";
    const serverErrors = error.reason?.servers
      ? [...error.reason.servers.values()]
          .map((server) => {
            let cause = server.error;
            const chain = [];
            while (cause) {
              chain.push(
                `${cause.name || "Error"}${cause.code ? ` (${cause.code})` : ""}`,
              );
              cause = cause.cause;
            }
            return chain.length ? chain.join(" caused by ") : null;
          })
          .filter(Boolean)
      : [];
    const underlyingErrors = [...new Set(serverErrors)];
    const underlyingSummary = underlyingErrors.length
      ? `; underlying failures: ${underlyingErrors.join(", ")}`
      : "";
    const errorMessage = String(error.message || "Unknown connection error").replace(
      /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
      "[redacted MongoDB URI]",
    );
    console.error(
      `MongoDB connection failed (${errorName}${errorCode}${underlyingSummary}): ${errorMessage}`,
    );
    throw new Error(
      `Unable to connect to the configured MongoDB database (${errorName}${errorCode}${underlyingSummary}).`,
    );
  }
};

module.exports = connectDB;
module.exports.getMongoUri = getMongoUri;
