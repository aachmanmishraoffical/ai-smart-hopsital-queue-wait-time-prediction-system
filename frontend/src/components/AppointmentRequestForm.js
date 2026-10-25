import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

const localDateTimeValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const AppointmentRequestForm = ({ hospital }) => {
  const [department, setDepartment] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [acknowledgedNotSent, setAcknowledgedNotSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] = useState(null);
  const idempotencyKey = useRef("");

  if (!hospital?._id) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="font-semibold text-slate-900">Appointment requests unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This public map listing is not a saved hospital directory record, so
          this platform cannot safely create a request for it.
        </p>
      </section>
    );
  }

  const submitRequest = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCreatedRequest(null);
    if (!idempotencyKey.current) {
      idempotencyKey.current = window.crypto.randomUUID();
    }
    try {
      const response = await api.post(
        "/appointment-requests",
        {
          hospitalId: hospital._id,
          department,
          requestedAt: new Date(requestedAt).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          acknowledgedNotSent,
        },
        { headers: { "Idempotency-Key": idempotencyKey.current } },
      );
      setCreatedRequest(response.data.request);
      idempotencyKey.current = "";
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to save your appointment request. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950">
      <h2 className="font-semibold">Save an appointment request</h2>
      <p className="mt-2 text-sm leading-6">
        This saves a request to your patient account only. It is not sent to the
        hospital, does not reserve a slot, and is not an appointment
        confirmation. Confirm availability directly with the hospital.
      </p>
      <form onSubmit={submitRequest} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Requested department
          <input
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            maxLength={120}
            required
            className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900"
            placeholder="Enter the department you want to contact"
          />
          <span className="mt-1 block text-xs font-normal text-sky-900">
            A requested department is not confirmation that this hospital offers it.
          </span>
        </label>
        <label className="text-sm font-medium">
          Requested date and time
          <input
            type="datetime-local"
            value={requestedAt}
            min={localDateTimeValue(new Date(Date.now() + 60000))}
            onChange={(event) => setRequestedAt(event.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-slate-900"
          />
        </label>
        <label className="flex items-start gap-3 text-sm leading-5 sm:col-span-2">
          <input
            type="checkbox"
            checked={acknowledgedNotSent}
            onChange={(event) => setAcknowledgedNotSent(event.target.checked)}
            required
            className="mt-1"
          />
          <span>
            I understand this request is only stored on this platform and is
            not sent to or accepted by the hospital.
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700 sm:col-span-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !localStorage.getItem("userToken")}
          className="rounded-full bg-sky-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
        >
          {loading ? "Saving request..." : "Save request (not sent)"}
        </button>
        {!localStorage.getItem("userToken") && (
          <p className="text-sm sm:col-span-2">
            <Link to="/login" className="font-semibold underline">
              Sign in
            </Link>{" "}
            to save a private appointment request in your account.
          </p>
        )}
      </form>
      {createdRequest && (
        <div role="status" className="mt-5 rounded-xl bg-white p-4 text-sm">
          <p className="font-semibold">
            Request {createdRequest.reference} saved — pending your direct
            confirmation with the hospital.
          </p>
          <p className="mt-2">{createdRequest.message}</p>
          <Link
            to="/appointments/history"
            className="mt-3 inline-block font-semibold underline"
          >
            View appointment requests
          </Link>
        </div>
      )}
    </section>
  );
};

export default AppointmentRequestForm;
