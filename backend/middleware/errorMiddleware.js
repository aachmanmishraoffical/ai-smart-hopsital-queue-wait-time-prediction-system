const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode =
    err.code === 11000 ? 409 : res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message:
      err.code === 11000
        ? "A record with these details already exists."
        : process.env.NODE_ENV === "production" && statusCode >= 500
          ? "An unexpected server error occurred."
          : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
