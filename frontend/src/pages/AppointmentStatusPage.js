import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../services/api";
import { SOCKET_URL } from "../services/api";
import Loader from "../components/Loader";

const AppointmentStatusPage = () => {
  const { token } = useParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let socket;
    const fetchStatus = async (notify = false) => {
      if (window.Notification && Notification.permission === "default") {
        Notification.requestPermission();
      }
      try {
        const response = await api.get(`/appointments/${token}/status`);
        setStatus(response.data);
        if (
          notify &&
          window.Notification &&
          Notification.permission === "granted"
        ) {
          new Notification("Queue status updated", {
            body: `Your token status is ${response.data.appointment.status}.`,
          });
        }
      } catch (err) {
        setError(
          err.response?.data?.message || "Appointment status is unavailable.",
        );
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
    const pollId = window.setInterval(() => fetchStatus(), 15000);

    const connectToQueue = async () => {
      try {
        const response = await api.get(`/appointments/${token}/status`);
        const hospitalId =
          response.data.appointment.hospitalId?._id ||
          response.data.appointment.hospitalId;
        if (!hospitalId) return;
        socket = io(SOCKET_URL, {
          auth: { token: localStorage.getItem("userToken") },
        });
        socket.emit("join-hospital", hospitalId);
        socket.on("queue-updated", () => fetchStatus(true));
      } catch (err) {
        setError(
          err.response?.data?.message || "Live queue updates are unavailable.",
        );
      }
    };
    connectToQueue();

    return () => {
      window.clearInterval(pollId);
      if (socket) socket.disconnect();
    };
  }, [token]);

  const updateStatus = async (nextStatus) => {
    try {
      await api.put(
        `/appointments/${status.appointment.appointmentId}/status`,
        {
          status: nextStatus,
        },
      );
      const response = await api.get(`/appointments/${token}/status`);
      setStatus(response.data);
      setActionMessage(`Appointment ${nextStatus.replace("_", " ")} updated.`);
    } catch (err) {
      setActionMessage(
        err.response?.data?.message || "Unable to update appointment.",
      );
    }
  };

  if (loading) return <Loader />;
  if (!status)
    return (
      <div className="mx-auto max-w-3xl p-8">
        Appointment status unavailable.
      </div>
    );

  const downloadToken = () => {
    if (!status) return;
    const wait = Number.isFinite(status.estimatedWait)
      ? `${status.estimatedWait} min`
      : "Unavailable";
    const content = `Hospital: ${status.appointment.hospitalId?.hospitalName || status.appointment.hospitalId}\nDoctor: ${status.appointment.doctorId?.name || status.appointment.doctorId}\nToken: ${status.yourToken}\nEstimated Wait: ${wait}\nStatus: ${status.appointment.status}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${status.yourToken}_queue_token.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="rounded-[34px] bg-white p-10 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">
          {status.appointment.status === "booked"
            ? "Appointment record"
            : "Queue status"}
        </h1>
        <p className="mt-3 text-slate-600">
          Queue status is informational. A waiting-time estimate is shown only
          when sufficient recent operational observations are available.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </p>
        )}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <StatusCard
            label="Hospital"
            value={status.appointment.hospitalId?.hospitalName || "Hospital"}
          />
          <StatusCard
            label="Department"
            value={status.appointment.department}
          />
          <StatusCard
            label="Doctor"
            value={status.appointment.doctorId?.name || "Doctor"}
          />
          <StatusCard
            label="Appointment"
            value={`${new Date(status.appointment.appointmentDate).toLocaleDateString()} at ${status.appointment.appointmentSlot}`}
          />
          <StatusCard label="Current Token" value={status.currentToken || "Unavailable"} />
          <StatusCard label="Your Token" value={status.yourToken} />
          <StatusCard label="Patients Ahead" value={status.patientsAhead ?? "Not checked in"} />
          <StatusCard label="Queue Position" value={status.queuePosition ?? "Not checked in"} />
          <StatusCard label="Queue Size" value={status.currentQueueSize} />
          <StatusCard
            label="Est. Wait"
            value={
              Number.isFinite(status.estimatedWait)
                ? `${status.estimatedWait} min`
                : "Unavailable"
            }
          />
          <StatusCard label="Appointment" value={status.appointment.status} />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/appointments/history"
            className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            My appointments
          </Link>
          <button
            onClick={downloadToken}
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Download token
          </button>
          <p className="text-sm text-slate-600">
            Save your digital queue token for quick check-in.
          </p>
        </div>
        {status.appointment.status === "booked" && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
              type="button"
              onClick={() => updateStatus("cancelled")}
              className="rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Cancel appointment
            </button>
            <p className="self-center text-sm text-slate-600">
              Check-in must be recorded by hospital staff.
            </p>
          </div>
        )}
        {actionMessage && (
          <p className="mt-3 text-sm text-slate-600">{actionMessage}</p>
        )}
      </div>
    </main>
  );
};

const StatusCard = ({ label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
      {label}
    </p>
    <p className="mt-4 text-3xl font-semibold text-slate-900">{value}</p>
  </div>
);

export default AppointmentStatusPage;
