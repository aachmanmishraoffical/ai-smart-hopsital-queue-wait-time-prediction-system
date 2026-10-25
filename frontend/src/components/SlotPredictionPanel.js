import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiArrowDownRight,
  FiCalendar,
  FiClock,
  FiMapPin,
  FiRefreshCw,
  FiShield,
  FiZap,
} from "react-icons/fi";

const toDateTimeInput = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const getTomorrowSlot = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeInput(date);
};

const getDepartments = (hospital, doctors) =>
  [
    ...(hospital?.departments || []),
    ...(hospital?.specialities || []),
    ...doctors.map((doctor) => doctor.department),
  ]
    .filter((department) => typeof department === "string" && department.trim())
    .map((department) => department.trim())
    .filter(
      (department, index, departments) =>
        departments.findIndex(
          (item) => item.toLowerCase() === department.toLowerCase(),
        ) === index,
    )
    .sort((first, second) => first.localeCompare(second));

const formatDateTime = (value, timeZone) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));

const stableNumber = (seed, minimum, maximum) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return minimum + (hash % (maximum - minimum + 1));
};

const SlotPredictionPanel = ({
  hospital,
  doctors,
}) => {
  const departments = useMemo(
    () => getDepartments(hospital, doctors),
    [hospital, doctors],
  );
  const [department, setDepartment] = useState("");
  const [requestedAt, setRequestedAt] = useState(getTomorrowSlot);
  const [prediction, setPrediction] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [analysisErrors, setAnalysisErrors] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedSlot, setAnalyzedSlot] = useState("");
  const [issuedToken, setIssuedToken] = useState(null);
  const analysisRun = useRef(0);
  const analysisTimer = useRef(null);

  useEffect(() => {
    analysisRun.current += 1;
    window.clearTimeout(analysisTimer.current);
    setAnalyzing(false);
    setDepartment(departments[0] || "");
    setPrediction(null);
    setComparison(null);
    setAnalysisErrors([]);
    setAnalyzedSlot("");
    setIssuedToken(null);
  }, [hospital?._id, hospital?.hospitalName, departments]);

  useEffect(
    () => () => {
      analysisRun.current += 1;
      window.clearTimeout(analysisTimer.current);
    },
    [],
  );

  const minimumDateTime = toDateTimeInput(new Date());
  const slotKey = `${department.trim().toLowerCase()}|${requestedAt}`;
  const tokenMatchesSlot =
    issuedToken &&
    issuedToken.department?.trim().toLowerCase() ===
      department.trim().toLowerCase() &&
    new Date(issuedToken.requestedAt).getTime() ===
      new Date(requestedAt).getTime();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const predictedWait = prediction?.available
    ? prediction.predictedWaitMinutes
    : null;
  const gaugeProgress =
    predictedWait === null
      ? 0
      : Math.min(100, Math.max(5, (predictedWait / 180) * 100));

  const resetAnalysis = () => {
    analysisRun.current += 1;
    window.clearTimeout(analysisTimer.current);
    setAnalyzing(false);
    setPrediction(null);
    setComparison(null);
    setAnalysisErrors([]);
    setAnalyzedSlot("");
  };

  const analyzeSlot = async (event) => {
    event.preventDefault();
    const date = new Date(requestedAt);
    if (!department.trim()) {
      setAnalysisErrors(["Choose or enter a department to continue."]);
      return;
    }
    if (!Number.isFinite(date.getTime()) || date <= new Date()) {
      setAnalysisErrors(["Choose a future date and time for this slot."]);
      return;
    }

    const currentRun = ++analysisRun.current;
    setAnalyzing(true);
    setAnalysisErrors([]);
    setPrediction(null);
    setComparison(null);
    setAnalyzedSlot("");
    analysisTimer.current = window.setTimeout(() => {
      if (currentRun !== analysisRun.current) return;
      const requestedTime = date.toISOString();
      const slotSeed = `${hospital?._id || hospital?.hospitalName}|${department.trim().toLowerCase()}|${requestedTime}`;
      const waitMinutes = stableNumber(slotSeed, 12, 75);
      const generatedAt = new Date().toISOString();

      setPrediction({
        available: true,
        predictedWaitMinutes: waitMinutes,
        method: "demo_simulated_forecast",
        observationCount: stableNumber(`${slotSeed}|observations`, 35, 180),
        modelVersion: "SHOWCASE-1.0",
        generatedAt,
        dataFreshness: generatedAt,
        reason: null,
      });
      setComparison({
        hospitals: [
          {
            hospitalName: "CityCare Medical Centre",
            address: "Demo listing · Central district",
            distanceKm: 1.4,
            hospitalId: "demo-citycare",
            department: { available: true, evidence: "demo_provider_record" },
            appointmentAvailability: { available: false },
            prediction: {
              available: true,
              predictedWaitMinutes: stableNumber(`${slotSeed}|citycare`, 8, 48),
              method: "demo_simulated_forecast",
              observationCount: stableNumber(`${slotSeed}|citycare-count`, 35, 180),
              reason: null,
            },
          },
          {
            hospitalName: "Green Valley General Hospital",
            address: "Demo listing · Riverside district",
            distanceKm: 2.8,
            hospitalId: "demo-green-valley",
            department: { available: true, evidence: "demo_provider_record" },
            appointmentAvailability: { available: false },
            prediction: {
              available: true,
              predictedWaitMinutes: stableNumber(`${slotSeed}|green-valley`, 10, 58),
              method: "demo_simulated_forecast",
              observationCount: stableNumber(`${slotSeed}|green-count`, 35, 180),
              reason: null,
            },
          },
          {
            hospitalName: "Metro Multispeciality Hospital",
            address: "Demo listing · West district",
            distanceKm: 4.2,
            hospitalId: "demo-metro",
            department: { available: true, evidence: "demo_provider_record" },
            appointmentAvailability: { available: false },
            prediction: {
              available: true,
              predictedWaitMinutes: stableNumber(`${slotSeed}|metro`, 14, 68),
              method: "demo_simulated_forecast",
              observationCount: stableNumber(`${slotSeed}|metro-count`, 35, 180),
              reason: null,
            },
          },
        ],
        notice:
          "DEMO DATA: nearby hospital names, distances, departments, and wait times are illustrative examples, not live hospital listings.",
      });
      setAnalyzedSlot(slotKey);
      setAnalyzing(false);
    }, 1400);
  };

  const nearbyHospitals = [...(comparison?.hospitals || [])].sort(
    (first, second) => {
      if (first.prediction.available !== second.prediction.available) {
        return first.prediction.available ? -1 : 1;
      }
      return (
        (first.prediction.predictedWaitMinutes ?? Number.POSITIVE_INFINITY) -
        (second.prediction.predictedWaitMinutes ?? Number.POSITIVE_INFINITY)
      );
    },
  );

  const generateDemoToken = () => {
    const suffix = window.crypto?.randomUUID
      ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    setIssuedToken({
      tokenCode: `DEMO-${suffix}`,
      department,
      requestedAt: new Date(requestedAt).toISOString(),
      createdAt: new Date().toISOString(),
      hospitalName: hospital?.hospitalName || "Demo Hospital",
      status: "DEMO CONFIRMED",
    });
  };

  return (
    <section className="slot-experience mt-8 overflow-hidden rounded-[30px] border border-slate-800 bg-slate-950 text-white shadow-2xl">
      <div className="slot-experience-glow" aria-hidden="true" />
      <div className="relative p-6 sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
              <FiActivity aria-hidden="true" /> Waiting-time demo
            </p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              Find your best time to visit
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Choose a department and future time to see a data-backed wait
              estimate and nearby hospitals for that same slot.
            </p>
          </div>
          <div className="slot-live-badge">
            <span className="slot-live-dot" />
            DEMO SIMULATION
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100">
          <strong>Showcase mode:</strong> predictions, nearby hospitals, and
          tokens below are generated demo examples. No hospital systems are
          contacted, no real AI model is queried, and no real appointment is
          booked.
        </div>

        <form
          onSubmit={analyzeSlot}
          className="slot-form mt-7 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[1fr_1fr_auto] sm:p-5"
        >
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <FiActivity aria-hidden="true" /> Department
            </span>
            <input
              list="hospital-departments"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                resetAnalysis();
              }}
              maxLength={120}
              required
              placeholder="e.g. Cardiology"
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            />
            <datalist id="hospital-departments">
              {departments.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <FiCalendar aria-hidden="true" /> Date and time
            </span>
            <input
              type="datetime-local"
              value={requestedAt}
              min={minimumDateTime}
              onChange={(event) => {
                setRequestedAt(event.target.value);
                resetAnalysis();
              }}
              required
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
            />
          </label>
          <button
            type="submit"
            disabled={analyzing}
            className="slot-analyze-button self-end rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70"
          >
            {analyzing ? (
              <span className="inline-flex items-center gap-2">
                <FiRefreshCw className="animate-spin" aria-hidden="true" />
                Analyzing
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <FiZap aria-hidden="true" /> Run demo prediction
              </span>
            )}
          </button>
        </form>

        {analysisErrors.length > 0 && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm text-rose-100"
          >
            {analysisErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        {analyzing && (
          <div
            className="slot-scanner mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-4">
              <div className="slot-radar" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div>
                <p className="font-semibold text-cyan-100">
                  Scanning department patterns
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Analyzing {department} for{" "}
                  {new Date(requestedAt).toLocaleString()} and matching nearby
                  hospitals...
                </p>
              </div>
            </div>
            <div className="slot-loading-bars mt-5" aria-hidden="true">
              {Array.from({ length: 12 }, (_, bar) => (
                <span key={bar} style={{ "--bar-index": bar }} />
              ))}
            </div>
          </div>
        )}

        {analyzedSlot === slotKey && (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <PredictionCard
                prediction={prediction}
                department={department}
                requestedAt={requestedAt}
                timezone={timezone}
                gaugeProgress={gaugeProgress}
              />
              <div className="slot-summary-card rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                  Your selected slot
                </p>
                <p className="mt-4 text-xl font-bold text-white">
                  {department}
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-300">
                  <FiClock className="mt-1 shrink-0 text-cyan-200" aria-hidden="true" />
                  {formatDateTime(requestedAt, timezone)}
                </p>
                <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <FiShield aria-hidden="true" /> Demo time zone: {timezone}
                </p>
                <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
                  This repeatable showcase prediction is simulated from the
                  selected hospital, department, and date/time. It is not a
                  live or trained AI prediction.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                    DEMO nearby options · same department + time
                  </p>
                  <h3 className="mt-2 text-xl font-bold">
                    Compare illustrative hospitals within 5 km
                  </h3>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">
                  {nearbyHospitals.length} nearby{" "}
                  {nearbyHospitals.length === 1 ? "option" : "options"}
                </span>
              </div>
              {comparison ? (
                nearbyHospitals.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {nearbyHospitals.map((item, index) => (
                      <NearbyHospitalCard
                        key={`${item.hospitalName}-${item.hospitalId || index}`}
                        hospital={item}
                        index={index}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
                    No nearby demo listings are available.
                  </div>
                )
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
                  Nearby comparison is currently unavailable.
                </div>
              )}
              {comparison?.notice && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {comparison.notice}
                </p>
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-cyan-200/20 bg-cyan-200/[0.06] p-5 sm:p-6">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                  <FiShield aria-hidden="true" /> Digital demo token
                </p>
                <h3 className="mt-2 text-lg font-bold text-white">
                  Create a demo booking token
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Generate a sample token for this department and time. This
                  simulates a successful booking flow entirely in the browser;
                  no hospital is contacted and no real appointment is created.
                </p>
              </div>
              <button
                type="button"
                onClick={generateDemoToken}
                className="mt-4 rounded-full bg-cyan-300 px-5 py-3 text-sm font-extrabold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200"
              >
                Generate demo token for this slot
              </button>
              {tokenMatchesSlot && (
                <div
                  role="status"
                  className="slot-token-success mt-5 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4"
                >
                  <p className="text-sm font-bold text-emerald-100">
                    DEMO TOKEN GENERATED · SAMPLE BOOKING CONFIRMED
                  </p>
                  <p className="mt-2 break-all text-2xl font-black tracking-wide text-white">
                    {issuedToken.tokenCode}
                  </p>
                  <p className="mt-2 text-sm text-emerald-100/80">
                    Requested slot:{" "}
                    {issuedToken.requestedAt
                      ? formatDateTime(issuedToken.requestedAt, timezone)
                      : formatDateTime(requestedAt, timezone)}
                    . Demo only: this is not a real appointment or hospital
                    reservation.
                  </p>
                  <p className="mt-2 text-xs text-emerald-100/70">
                    Generated locally at{" "}
                    {new Date(issuedToken.createdAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

const PredictionCard = ({
  prediction,
  department,
  requestedAt,
  timezone,
  gaugeProgress,
}) => (
  <article className="slot-prediction-card relative overflow-hidden rounded-2xl border border-cyan-200/20 bg-gradient-to-br from-cyan-300/[0.12] via-slate-900 to-indigo-400/[0.08] p-5 sm:p-6">
    <div className="slot-card-sheen" aria-hidden="true" />
    <div className="relative">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            DEMO predicted waiting time
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {department} · {formatDateTime(requestedAt, timezone)}
          </p>
        </div>
        <FiActivity className="text-xl text-cyan-200" aria-hidden="true" />
      </div>
      <div className="mt-5 flex items-center gap-5">
        <div className="slot-gauge" aria-label="Predicted wait gauge">
          <svg viewBox="0 0 112 112" role="img" aria-hidden="true">
            <circle className="slot-gauge-track" cx="56" cy="56" r="45" />
            <circle
              className="slot-gauge-value"
              cx="56"
              cy="56"
              r="45"
              style={{ "--gauge-offset": `${282.7 * (1 - gaugeProgress / 100)}` }}
            />
          </svg>
          <div className="slot-gauge-center">
            {prediction?.available ? (
              <>
                <span key={prediction.predictedWaitMinutes} className="slot-number">
                  {prediction.predictedWaitMinutes}
                </span>
                <span>MIN</span>
              </>
            ) : (
              <>
                <FiClock aria-hidden="true" />
                <span>WAIT</span>
              </>
            )}
          </div>
        </div>
        <div>
          {prediction?.available ? (
            <>
              <p className="text-2xl font-black text-white">
                {prediction.predictedWaitMinutes} min
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm text-emerald-200">
                <FiArrowDownRight aria-hidden="true" /> Forecast ready
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-white">
                Estimate unavailable
              </p>
              <p className="mt-1 max-w-xs text-sm leading-5 text-slate-400">
                {prediction?.reason ||
                  "The hospital-specific estimate could not be loaded."}
              </p>
            </>
          )}
        </div>
      </div>
      {prediction?.available && (
        <div className="mt-5 flex flex-wrap gap-2">
          <MetadataPill label="simulated showcase model" />
          <MetadataPill>
            {prediction.observationCount} demo{" "}
            {prediction.observationCount === 1 ? "sample" : "samples"}
          </MetadataPill>
          {prediction.modelVersion && (
            <MetadataPill>Model {prediction.modelVersion}</MetadataPill>
          )}
        </div>
      )}
      {prediction?.available && (
        <p className="mt-4 text-xs leading-5 text-slate-400">
          Generated{" "}
          {prediction.generatedAt
            ? new Date(prediction.generatedAt).toLocaleString()
            : "just now"}
          . The result is generated locally for demonstration and is not a
          real-world estimate.
        </p>
      )}
    </div>
  </article>
);

const NearbyHospitalCard = ({ hospital, index }) => (
  <article
    className="slot-nearby-card rounded-2xl border border-white/10 bg-white/[0.04] p-4"
    style={{ "--card-index": index }}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="font-bold text-white">{hospital.hospitalName}</h4>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
          <FiMapPin aria-hidden="true" /> {hospital.distanceKm} km away
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
          hospital.prediction.available
            ? "bg-emerald-300/10 text-emerald-200"
            : "bg-white/10 text-slate-400"
        }`}
      >
        {hospital.prediction.available
          ? `${hospital.prediction.predictedWaitMinutes} min`
          : "No estimate"}
      </span>
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-400">
      {hospital.prediction.available
        ? `Simulated ${hospital.prediction.observationCount}-sample estimate for this department and time`
        : hospital.prediction.reason || "Waiting-time estimate unavailable."}
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <MetadataPill>
        {hospital.department.available
          ? "Demo department match"
          : "Demo department example"}
      </MetadataPill>
      <MetadataPill>Illustrative data only</MetadataPill>
    </div>
  </article>
);

const MetadataPill = ({ children, label }) => (
  <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 text-[10px] font-semibold capitalize tracking-wide text-slate-300">
    {children || label}
  </span>
);

export default SlotPredictionPanel;
