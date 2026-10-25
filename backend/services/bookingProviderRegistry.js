const adapters = new Map();

const registerBookingAdapter = (adapter) => {
  if (
    !adapter ||
    typeof adapter.providerKey !== "string" ||
    !adapter.providerKey.trim() ||
    typeof adapter.getCapabilities !== "function" ||
    typeof adapter.getAvailability !== "function" ||
    typeof adapter.createBooking !== "function" ||
    typeof adapter.cancelBooking !== "function" ||
    adapters.has(adapter.providerKey)
  ) {
    throw new Error("A unique booking adapter with all required methods is required.");
  }
  adapters.set(adapter.providerKey, adapter);
};

const getBookingAdapter = (providerKey) => adapters.get(providerKey) || null;

const getProviderHealth = () => ({
  status: adapters.size ? "adapters_registered" : "not_configured",
  configured: adapters.size > 0,
  providers: [...adapters.keys()],
  message: adapters.size
    ? "Adapters are registered; hospital-specific authorization must still be verified."
    : "No hospital booking adapter is configured.",
});

const getBookingCapabilities = async (hospital) => {
  const configuration = hospital?.bookingIntegration;
  if (
    !configuration ||
    configuration.authorizationStatus !== "authorized" ||
    !configuration.authorizationEvidence ||
    !configuration.authorizedAt
  ) {
    return {
      status: "not_configured",
      available: false,
      message:
        "No hospital-authorized booking integration is configured for this hospital.",
    };
  }
  const adapter = getBookingAdapter(configuration.providerKey);
  if (!adapter) {
    return {
      status: "adapter_unavailable",
      available: false,
      message: "The configured booking provider adapter is unavailable.",
    };
  }
  return adapter.getCapabilities({ hospital, configuration });
};

module.exports = {
  getBookingAdapter,
  getBookingCapabilities,
  getProviderHealth,
  registerBookingAdapter,
};
