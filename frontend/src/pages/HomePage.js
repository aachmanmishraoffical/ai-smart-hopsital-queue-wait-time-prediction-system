import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import HospitalCard from "../components/HospitalCard";
import MapSection from "../components/MapSection";
import FeatureCard from "../components/FeatureCard";
import StatisticCard from "../components/StatisticCard";
import Loader from "../components/Loader";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCalendar, FiMapPin } from "react-icons/fi";

const features = [
  {
    title: "Appointments",
    description:
      "Save a private platform-only request. It is not sent to a hospital or confirmed until you contact them directly.",
  },
  {
    title: "Waiting-time estimates",
    description:
      "Shown only when a verified live queue and sufficient recent consultation data are connected.",
  },
  {
    title: "Nearby Hospitals",
    description:
      "Explore attributed directory entries and OpenStreetMap hospital points of interest. Listings do not confirm operation or services.",
  },
  {
    title: "Live Queue Status",
    description:
      "Queue updates are shown only for real appointments managed by a participating hospital.",
  },
];

const HomePage = () => {
  const [position, setPosition] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [providerStatus, setProviderStatus] = useState(null);
  const [comparisonDepartment, setComparisonDepartment] = useState("");
  const [comparisonDateTime, setComparisonDateTime] = useState("");
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [comparison, setComparison] = useState(null);
  const locationRequest = useRef(null);
  const locationAction = useRef(0);

  useEffect(() => {
    return () => {
      locationAction.current += 1;
      locationRequest.current?.abort();
    };
  }, []);

  const loadNearbyHospitals = async (latitude, longitude, label) => {
    locationAction.current += 1;
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    setLoading(true);
    setError(null);
    setHospitals([]);
    setComparison(null);
    setPosition({ lat: latitude, lon: longitude });
    setLocationLabel(label);
    setProviderStatus(null);
    try {
      const response = await api.get("/hospitals/nearby", {
        params: { lat: latitude, lon: longitude, radius: 5000 },
        signal: controller.signal,
      });
      setHospitals(response.data.hospitals || []);
      setProviderStatus(response.data.providers || null);
    } catch (requestError) {
      if (requestError.code !== "ERR_CANCELED") {
        setError(
          requestError.response?.data?.message ||
            "Nearby hospital search failed. Check your connection and try again.",
        );
      }
    } finally {
      if (locationRequest.current === controller) {
        locationRequest.current = null;
        setLoading(false);
      }
    }
  };

  const compareSameSlot = async (event) => {
    event.preventDefault();
    if (!position) return;
    setComparisonLoading(true);
    setComparisonError("");
    setComparison(null);
    try {
      const response = await api.get("/comparisons/nearby", {
        params: {
          lat: position.lat,
          lon: position.lon,
          radius: 5000,
          department: comparisonDepartment.trim(),
          requestedAt: new Date(comparisonDateTime).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setComparison(response.data);
    } catch (requestError) {
      setComparisonError(
        requestError.response?.data?.message ||
          "Same-slot comparison is temporarily unavailable. Please retry.",
      );
    } finally {
      setComparisonLoading(false);
    }
  };

  const locateNearby = () => {
    const action = ++locationAction.current;
    locationRequest.current?.abort();
    locationRequest.current = null;
    if (!navigator.geolocation) {
      setLoading(false);
      setError(
        "This browser does not support location access. Search by city, locality, or postal code instead.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    setResolvedLocation(null);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        if (action !== locationAction.current) return;
        if (
          !Number.isFinite(result.coords.latitude) ||
          result.coords.latitude < -90 ||
          result.coords.latitude > 90 ||
          !Number.isFinite(result.coords.longitude) ||
          result.coords.longitude < -180 ||
          result.coords.longitude > 180 ||
          !Number.isFinite(result.coords.accuracy) ||
          result.coords.accuracy < 0
        ) {
          setLoading(false);
          setError("The browser returned invalid coordinates. Try searching for a location.");
          return;
        }
        const accuracyNotice =
          result.coords.accuracy > 5000
            ? " (location accuracy is low)"
            : "";
        loadNearbyHospitals(
          result.coords.latitude,
          result.coords.longitude,
          `Your current location${accuracyNotice}`,
        );
      },
      (locationError) => {
        if (action !== locationAction.current) return;
        setLoading(false);
        setError(
          locationError.code === 1
            ? "Location permission was denied. Search by city, locality, or postal code instead."
            : locationError.code === 3
              ? "Location detection timed out. Retry or search by city, locality, or postal code."
              : "Your location is unavailable. Search by city, locality, or postal code instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    );
  };

  const resolveManualLocation = async (event) => {
    event.preventDefault();
    const action = ++locationAction.current;
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    setLoading(true);
    setError(null);
    setResolvedLocation(null);
    try {
      const response = await api.get("/hospitals/geocode", {
        params: { q: locationQuery.trim() },
        signal: controller.signal,
      });
      if (action === locationAction.current) {
        setResolvedLocation(response.data.location);
      }
    } catch (requestError) {
      if (
        action === locationAction.current &&
        requestError.code !== "ERR_CANCELED"
      ) {
        setError(
          requestError.response?.data?.message ||
            "Location search is temporarily unavailable. Please retry shortly.",
        );
      }
    } finally {
      if (locationRequest.current === controller) {
        locationRequest.current = null;
        if (action === locationAction.current) setLoading(false);
      }
    }
  };

  const filteredHospitals = hospitals.filter((hospital) => {
    const matchesSearch =
      (hospital.hospitalName || "")
        .toLowerCase()
        .includes(searchText.toLowerCase()) ||
      (hospital.address || "").toLowerCase().includes(searchText.toLowerCase());
    const matchesDepartment = (hospital.departments || [])
      .join(" ")
      .toLowerCase()
      .includes(searchText.toLowerCase());
    return matchesSearch || matchesDepartment;
  });

  return (
    <main className="dashboard-main space-y-12 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <section className="dashboard-hero">
        <div className="relative z-10 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
            Your patient dashboard
          </p>
          <h1>Welcome to a clearer way to plan your care.</h1>
          <p className="mt-5 text-sm sm:text-base">
            Explore hospitals near you, review the information available, and
            keep your visit details organized in one place.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#nearby-hospitals"
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-200"
            >
              <FiMapPin aria-hidden="true" /> Find nearby hospitals
            </a>
            <Link
              to="/appointments/history"
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white transition hover:border-emerald-200/60 hover:bg-white/10"
            >
              <FiCalendar aria-hidden="true" /> Appointment history
            </Link>
          </div>
        </div>
        <div className="dashboard-hero-note" aria-hidden="true">
          <span className="dashboard-note-icon"><FiMapPin /></span>
          <span><strong>Explore nearby</strong><small>Search when you are ready</small></span>
          <FiArrowRight className="dashboard-note-arrow" />
        </div>
      </section>
      <section id="nearby-hospitals" className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Nearby Hospitals
            </p>
            <h2 className="text-3xl font-bold text-slate-900">
              Hospitals close to you
            </h2>
          </div>
          <div className="text-sm text-slate-600">
            Source-listed facilities are not necessarily participating and do
            not confirm current services or availability.
          </div>
        </div>
        {locationLabel && (
          <p className="text-sm text-slate-600">
            Search centered on: <strong>{locationLabel}</strong>
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">
              Search hospitals
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by hospital name, address, or listed department"
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={locateNearby}
                disabled={loading}
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {loading ? "Searching..." : "Use my location"}
              </button>
            </div>
            <form
              onSubmit={resolveManualLocation}
              className="mt-5 border-t border-slate-100 pt-4"
            >
              <label
                htmlFor="manual-location"
                className="block text-sm font-medium text-slate-700"
              >
                Or search by city, locality, or postal code
              </label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <input
                  id="manual-location"
                  type="search"
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                  placeholder="Enter a place in India"
                  className="min-w-0 flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  Resolve location
                </button>
              </div>
            </form>
            {resolvedLocation && (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
                <p>
                  Location found: <strong>{resolvedLocation.label}</strong>
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  Confirm the resolved place before searching nearby.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    loadNearbyHospitals(
                      resolvedLocation.latitude,
                      resolvedLocation.longitude,
                      resolvedLocation.label,
                    )
                  }
                  disabled={loading}
                  className="mt-3 rounded-full bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  Search this location
                </button>
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <Loader />
        ) : error ? (
          <div role="alert" className="rounded-3xl border border-rose-100 bg-rose-50 p-6 text-rose-800">
            <p>{error}</p>
            {position && (
              <button
                type="button"
                onClick={() =>
                  loadNearbyHospitals(position.lat, position.lon, locationLabel)
                }
                className="mt-4 rounded-full bg-rose-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-900"
              >
                Retry hospital search
              </button>
            )}
          </div>
        ) : (
          !position ? (
            <p className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
              Choose “Use my location” or resolve a city/locality above to find
              nearby hospitals. Your location is not requested automatically.
            </p>
          ) : filteredHospitals.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-xl text-emerald-700">
                <FiMapPin aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                No hospital listings found for this search
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
                Try a nearby location or expand your search area. No sample
                listings have been added.
              </p>
              <button
                type="button"
                onClick={() =>
                  loadNearbyHospitals(position.lat, position.lon, locationLabel)
                }
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Retry this search <FiArrowRight aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {filteredHospitals.map((hospital) => (
                <HospitalCard
                  key={hospital._id || hospital.hospitalId}
                  hospital={hospital}
                />
              ))}
            </div>
          )
        )}
        {providerStatus?.openStreetMap === "unavailable" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <p>
              The map-based hospital directory is temporarily unavailable.
              Available directory results are still shown.
            </p>
            <button
              type="button"
              onClick={() =>
                loadNearbyHospitals(position.lat, position.lon, locationLabel)
              }
              disabled={loading}
              className="shrink-0 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
            >
              Retry hospital search
            </button>
          </div>
        )}
        {position && (
          <section className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6">
            <h3 className="text-xl font-semibold text-indigo-950">
              Compare the same department and requested time
            </h3>
            <p className="mt-2 text-sm leading-6 text-indigo-900">
              Results compare nearby public listings for your selected slot.
              Department listings do not prove the service is offered.
              Availability and wait estimates appear only when verified
              hospital integrations or reviewed data support them.
            </p>
            <form
              onSubmit={compareSameSlot}
              className="mt-5 grid gap-4 sm:grid-cols-3"
            >
              <label className="text-sm font-medium text-indigo-950">
                Department to compare
                <input
                  value={comparisonDepartment}
                  onChange={(event) =>
                    setComparisonDepartment(event.target.value)
                  }
                  required
                  maxLength={120}
                  className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-slate-900"
                  placeholder="Enter a department"
                />
              </label>
              <label className="text-sm font-medium text-indigo-950">
                Requested date and time
                <input
                  type="datetime-local"
                  value={comparisonDateTime}
                  onChange={(event) =>
                    setComparisonDateTime(event.target.value)
                  }
                  min={new Date(
                    Date.now() + 60000 - new Date().getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)}
                  required
                  className="mt-2 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-slate-900"
                />
              </label>
              <button
                type="submit"
                disabled={comparisonLoading}
                className="self-end rounded-full bg-indigo-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {comparisonLoading ? "Comparing..." : "Compare nearby"}
              </button>
            </form>
            {comparisonError && (
              <p role="alert" className="mt-4 text-sm text-rose-800">
                {comparisonError}
              </p>
            )}
            {comparison && (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-indigo-900">
                  {comparison.hospitals.length} listing(s), ordered by
                  distance. {comparison.notice}
                </p>
                {comparison.hospitals.length === 0 ? (
                  <p className="rounded-xl bg-white p-4 text-sm text-slate-700">
                    No listings were returned by available providers for this
                    search. No sample hospitals or availability were added.
                  </p>
                ) : (
                  comparison.hospitals.map((item, index) => (
                    <article
                      key={item.hospitalId || `${item.hospitalName}-${index}`}
                      className="rounded-2xl border border-indigo-100 bg-white p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <h4 className="font-semibold text-slate-900">
                          {item.hospitalName}
                        </h4>
                        <span className="text-sm text-slate-600">
                          {item.distanceKm} km away
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {item.department.evidence.replaceAll("_", " ")} for{" "}
                        {item.department.requested}
                        {item.source?.name
                          ? ` · listed by ${item.source.name}`
                          : " · OpenStreetMap listing"}
                        {item.source?.retrievedAt
                          ? ` · source retrieved ${new Date(
                              item.source.retrievedAt,
                            ).toLocaleDateString()}`
                          : ""}
                      </p>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <p className="text-slate-700">
                          Booking availability:{" "}
                          {item.appointmentAvailability.available
                            ? "available from the configured provider"
                            : item.appointmentAvailability.message}
                        </p>
                        <p className="text-slate-700">
                          Waiting estimate:{" "}
                          {item.prediction.available
                            ? `${item.prediction.predictedWaitMinutes} min (${item.prediction.method})`
                            : item.prediction.reason}
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        )}
      </section>
      <section className="grid gap-8 lg:grid-cols-2 xl:grid-cols-[0.95fr_0.8fr]">
        <div className="rounded-[34px] bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Map view
          </p>
          <h2 className="mt-4 text-3xl font-bold text-slate-900">
            Explore hospitals on the map
          </h2>
          <p className="mt-3 text-slate-600">
            See source-listed hospital locations and distances. Directory data
            does not report emergency capacity or clinical availability.
          </p>
          <div className="mt-8">
            {position ? (
              <MapSection
                position={position}
                hospitals={hospitals.slice(0, 8)}
                locationLabel={locationLabel}
              />
            ) : (
              <p className="rounded-3xl bg-slate-50 p-6 text-sm text-slate-600">
                Choose “Use my location” or confirm a searched place to show a
                map centered on that location.
              </p>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatisticCard value="5 km" label="Search radius" />
            <StatisticCard value={String(hospitals.length)} label="Locations in results" />
          </div>
        </div>
      </section>
    </main>
  );
};

export default HomePage;
