import { useState } from "react";
import api from "../services/api";

const localDateTimeValue = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const WaitObservationForm = ({ hospital }) => {
  const [department, setDepartment] = useState("");
  const [arrivalAt, setArrivalAt] = useState("");
  const [serviceStartAt, setServiceStartAt] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!hospital?._id || !localStorage.getItem("userToken")) return null;

  const submitObservation = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult("");
    try {
      const response = await api.post("/prediction-observations", {
        hospitalId: hospital._id,
        department,
        arrivalAt: new Date(arrivalAt).toISOString(),
        serviceStartAt: new Date(serviceStartAt).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        consent,
      });
      setResult(response.data.observation.message);
      setDepartment("");
      setArrivalAt("");
      setServiceStartAt("");
      setConsent(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to submit the observation. Please check the recorded times.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950">
      <h2 className="font-semibold">Share an actual waiting-time observation</h2>
      <p className="mt-2 text-sm leading-6">
        Share only your arrival and service-start times. No diagnosis or medical
        details are collected, and your account ID is not stored with the
        report. Reports need review and are not used in predictions until
        approved.
      </p>
      <form onSubmit={submitObservation} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Department visited
          <input
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            maxLength={120}
            required
            className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-slate-900"
          />
        </label>
        <label className="text-sm font-medium">
          Arrival time
          <input
            type="datetime-local"
            value={arrivalAt}
            max={localDateTimeValue(new Date())}
            onChange={(event) => setArrivalAt(event.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-slate-900"
          />
        </label>
        <label className="text-sm font-medium">
          Service start time
          <input
            type="datetime-local"
            value={serviceStartAt}
            max={localDateTimeValue(new Date())}
            onChange={(event) => setServiceStartAt(event.target.value)}
            required
            className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-slate-900"
          />
        </label>
        <label className="flex items-start gap-3 text-sm leading-5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            required
            className="mt-1"
          />
          <span>
            I consent to anonymous use of these times for aggregate waiting-time
            estimates, subject to review.
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-700 sm:col-span-2">
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="text-sm sm:col-span-2">
            {result}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-violet-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
        >
          {loading ? "Submitting..." : "Submit anonymous observation"}
        </button>
      </form>
    </section>
  );
};

export default WaitObservationForm;
