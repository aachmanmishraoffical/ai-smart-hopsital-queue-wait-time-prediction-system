import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import Loader from "../components/Loader";

const RecommendationsPage = () => {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!navigator.geolocation) {
      setMessage("Location is unavailable. No default location is used.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await api.get("/recommendations", {
            params: { lat: coords.latitude, lon: coords.longitude, radius: 5 },
          });
          setHospitals(response.data.recommendations || []);
          if (!response.data.recommendations?.length) {
            setMessage(
              "No verified participating hospitals are available in this area. No sample locations are shown.",
            );
          }
        } catch (error) {
          setMessage(
            error.response?.data?.message ||
              "Unable to load nearby verified hospital listings.",
          );
        } finally {
          setLoading(false);
        }
      },
      () => {
        setMessage(
          "Location permission was not granted. Allow location access to find nearby participating hospitals.",
        );
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="rounded-[34px] bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Verified participants
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Nearby hospitals
        </h1>
        <p className="mt-2 text-slate-600">
          Sorted by distance only. Current doctor availability, appointment
          slots, and queue information are not inferred from a directory entry.
        </p>
        {loading ? (
          <Loader />
        ) : hospitals.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {hospitals.map(({ hospital, distance }) => (
              <article
                key={hospital._id}
                className="rounded-3xl border border-slate-200 p-6"
              >
                <h2 className="text-xl font-semibold text-slate-900">
                  {hospital.hospitalName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {hospital.address}
                </p>
                <p className="mt-4 text-sm text-slate-700">
                  Distance: {distance.toFixed(2)} km
                </p>
                <Link
                  to={`/hospital/${hospital._id}`}
                  className="mt-5 inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  View listing
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-2xl bg-amber-50 p-5 text-amber-900">
            {message || "No verified participating hospitals were found."}
          </p>
        )}
      </div>
    </main>
  );
};

export default RecommendationsPage;
