import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import Loader from "../components/Loader";
import AppointmentRequestForm from "../components/AppointmentRequestForm";
import WaitObservationForm from "../components/WaitObservationForm";
import SlotPredictionPanel from "../components/SlotPredictionPanel";

const HospitalDetailsPage = () => {
  const { id, type, recordId } = useParams();
  const [hospital, setHospital] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setHospital(null);
    setDoctors([]);
    api
      .get(
        type && recordId
          ? `/hospitals/osm/${type}/${recordId}`
          : `/hospitals/${id}`,
      )
      .then((response) => {
        if (active) {
          setHospital(response.data.hospital);
          setDoctors(response.data.doctors || []);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.message ||
              "Unable to load the hospital source record.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, type, recordId]);

  if (loading) return <Loader />;

  if (!hospital) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Hospital listing unavailable
          </h1>
          <p className="mt-3 text-slate-600">{error}</p>
          <Link
            to="/hospitals"
            className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Return to directory
          </Link>
        </div>
      </main>
    );
  }

  const participating =
    hospital.participating === true &&
    hospital.source?.verificationStatus === "verified";
  const isOpenStreetMap = hospital.source?.name === "OpenStreetMap";

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <article className="rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          {participating
            ? "Verified participating hospital"
            : isOpenStreetMap
              ? "OpenStreetMap hospital point of interest"
              : "Directory listing"}
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          {hospital.hospitalName}
        </h1>
        <p className="mt-3 text-slate-600">{hospital.address}</p>
        {Number.isFinite(Number(hospital.latitude)) &&
          Number.isFinite(Number(hospital.longitude)) && (
            <p className="mt-4 text-sm text-slate-500">
              Coordinates: {Number(hospital.latitude).toFixed(5)},{" "}
              {Number(hospital.longitude).toFixed(5)}
            </p>
          )}

        {participating ? (
          <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <h2 className="font-semibold">Verified participating providers</h2>
            <p className="mt-2 text-sm leading-6">
              Providers below come from verified records associated with this
              hospital. Use the clearly labeled demo flow below to showcase
              date selection, wait-time estimates, and sample token generation.
            </p>
            {doctors.length === 0 ? (
              <p className="mt-4 text-sm leading-6">
                No verified provider records are available for this listing.
                The demo flow below still works with sample results.
              </p>
            ) : (
              <div className="mt-5 grid gap-4">
                {doctors.map((doctor) => {
                  return (
                    <article
                      key={doctor._id}
                      className="rounded-xl border border-emerald-200 bg-white p-4"
                    >
                      <h3 className="font-semibold text-slate-900">
                        {doctor.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {doctor.department}
                        {doctor.specialization
                          ? ` · ${doctor.specialization}`
                          : ""}
                      </p>
                      <p className="mt-3 text-xs text-slate-500">
                        Provider information is shown for reference. The
                        animated wait-time experience below uses simulated
                        showcase data.
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <h2 className="font-semibold">Directory listing only</h2>
            <p className="mt-2 text-sm leading-6">
              This source listing does not confirm current services, doctors,
              appointment slots, or queue conditions. The demo below uses
              illustrative estimates and a browser-generated demo token; it
              does not connect to this hospital or create a real appointment.
            </p>
          </section>
        )}

        <SlotPredictionPanel
          hospital={hospital}
          doctors={doctors}
        />

        <AppointmentRequestForm hospital={hospital} />
        <WaitObservationForm hospital={hospital} />

        <section className="mt-8 border-t border-slate-100 pt-6">
          <h2 className="font-semibold text-slate-900">Source and verification</h2>
          {hospital.source?.url ? (
            <p className="mt-3 text-sm text-slate-600">
              Source:{" "}
              <a
                href={hospital.source.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                {hospital.source.name}
              </a>
              {hospital.source.recordId && ` · Record ${hospital.source.recordId}`}
            </p>
          ) : (
            <p className="mt-3 text-sm text-amber-800">
              Source documentation is unavailable.
            </p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            Record status: {hospital.source?.verificationStatus || "unknown"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Retrieved:{" "}
            {hospital.source?.retrievedAt
              ? new Date(hospital.source.retrievedAt).toLocaleString()
              : "unknown"}
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Source-listed records are not proof of current operation or service
            availability.
          </p>
          {(hospital.officialWebsite || hospital.officialPhone) && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-800">
                Published contact details (verify before use)
              </p>
              {hospital.officialWebsite && (
                <a
                  href={hospital.officialWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-emerald-800 underline"
                >
                  Official website
                </a>
              )}
              {hospital.officialPhone && (
                <a
                  href={`tel:${hospital.officialPhone}`}
                  className="mt-2 block text-emerald-800 underline"
                >
                  {hospital.officialPhone}
                </a>
              )}
            </div>
          )}
        </section>

        <Link
          to="/hospitals"
          className="mt-8 inline-flex rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Return to directory
        </Link>
      </article>
    </main>
  );
};

export default HospitalDetailsPage;
