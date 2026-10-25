const { getProviderHealth } = require("../services/bookingProviderRegistry");
const { getPredictionServiceHealth } = require("../services/predictionModelClient");

const getIntegrationStatus = async (_req, res) => {
  const [prediction] = await Promise.all([getPredictionServiceHealth()]);
  return res.json({
    booking: getProviderHealth(),
    queue: {
      status: "not_configured",
      authorizedLiveQueue: false,
      message: "No hospital-authorized live queue integration is configured.",
    },
    prediction,
  });
};

module.exports = { getIntegrationStatus };
