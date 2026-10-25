import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import Loader from "../components/Loader";

const AppointmentHistoryPage = () => {
  const [appointments, setAppointments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const [appointmentResponse, requestResponse] = await Promise.all([
          api.get("/appointments/my"),
          api.get("/appointment-requests/my"),
        ]);
        setAppointments(appointmentResponse.data.appointments || []);
        setRequests(requestResponse.data.requests || []);
      } catch (err) {
        setError("Unable to load appointment history.");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const cancelRequest = async (reference) => {
    setActionError("");
    try {
      const response = await api.post(
        `/appointment-requests/${encodeURIComponent(reference)}/cancel`,
      );
      setRequests((current) =>
        current.map((item) =>
          item.reference === reference ? response.data.request : item,
        ),
      );
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.message ||
          "Unable to cancel this appointment request.",
      );
    }
  };

  if (loading) return <Loader />;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="rounded-[34px] bg-white p-10 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Appointment History
            </h1>
            <p className="mt-2 text-slate-600">
              Appointments recorded by this system and their latest known status.
            </p>
          </div>
          <Link
            to="/hospitals"
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Search hospitals
          </Link>
        </div>

        {error && (
          <div className="mt-8 rounded-3xl bg-rose-50 p-6 text-rose-700">
            {error}
          </div>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-slate-900">
            Platform appointment requests
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Requests are saved only in your platform account. They are not sent
            to a hospital and are not confirmed bookings.
          </p>
          {actionError && (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
              {actionError}
            </p>
          )}
          {requests.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              No platform appointment requests recorded for this account.
            </p>
          ) : (
            <div className="mt-4 grid gap-4">
              {requests.map((request) => (
                <article
                  key={request.reference}
                  className="rounded-2xl border border-sky-200 bg-sky-50 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                        Platform request · {request.status.replaceAll("_", " ")}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900">
                        {request.hospital.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Requested department: {request.department}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Requested for:{" "}
                        {new Date(request.requestedAt).toLocaleString(
                          undefined,
                          { timeZone: request.timeZone },
                        )}{" "}
                        ({request.timeZone})
                      </p>
                      <p className="mt-2 text-sm font-semibold text-sky-900">
                        {request.reference}
                      </p>
                    </div>
                    {request.status === "pending_external_confirmation" &&
                      new Date(request.requestedAt) > new Date() && (
                        <button
                          type="button"
                          onClick={() => cancelRequest(request.reference)}
                          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50"
                        >
                          Cancel saved request
                        </button>
                      )}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-600">
                    {request.message}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Listing source:{" "}
                    <a
                      href={request.hospital.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {request.hospital.sourceName}
                    </a>{" "}
                    · retrieved{" "}
                    {new Date(
                      request.hospital.sourceRetrievedAt,
                    ).toLocaleDateString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-6">
          {appointments.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-slate-600">
              No appointments recorded for this account.
            </div>
          ) : (
            appointments.map((appointment) => (
              <div
                key={appointment._id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {appointment.hospitalId?.hospitalName || "Hospital"}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                      {appointment.queueToken}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      Doctor: {appointment.doctorId?.name || "Unknown"}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Department: {appointment.department}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Date and time:{" "}
                      {new Date(
                        appointment.appointmentDate,
                      ).toLocaleDateString()}{" "}
                      at {appointment.appointmentSlot}
                    </p>
                  </div>
                  <div className="space-y-2 text-right">
                    <p className="text-sm text-slate-500">Status</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {appointment.status}
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <Meta
                    label="Booked"
                    value={new Date(appointment.bookingTime).toLocaleString()}
                  />
                  <Meta
                    label="Predicted wait"
                    value={
                      Number.isFinite(appointment.predictedWait)
                        ? `${appointment.predictedWait} min`
                        : "Unavailable"
                    }
                  />
                  <Meta
                    label="Actual wait"
                    value={
                      Number.isFinite(appointment.actualWait) &&
                      appointment.actualWait > 0
                        ? `${appointment.actualWait} min`
                        : "Not recorded"
                    }
                  />
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to={`/appointment/${appointment.queueToken}`}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    View status
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
};

const Meta = ({ label, value }) => (
  <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
    <p className="font-semibold text-slate-900">{label}</p>
    <p className="mt-2">{value}</p>
  </div>
);

export default AppointmentHistoryPage;
