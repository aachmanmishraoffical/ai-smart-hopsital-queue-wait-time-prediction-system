import { Link, useNavigate } from "react-router-dom";
import { FiChevronRight } from "react-icons/fi";

const HospitalCard = ({ hospital }) => {
  const navigate = useNavigate();
  const hospitalIdentifier = hospital._id || hospital.hospitalId;
  const openStreetMap = hospital.source?.name === "OpenStreetMap";
  const [sourceType, sourceRecordId] = openStreetMap
    ? (hospital.source.recordId || "").split("/")
    : [];
  const hospitalPath =
    openStreetMap && sourceType && sourceRecordId
      ? `/hospitals/osm/${sourceType}/${sourceRecordId}`
      : `/hospitals/${hospitalIdentifier}`;
  const isParticipating =
    Boolean(hospital._id) &&
    hospital.participating !== false &&
    hospital.source?.verificationStatus === "verified";

  const openHospital = () => {
    navigate(hospitalPath, { state: { hospital } });
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openHospital}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openHospital();
        }
      }}
      className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">
            {hospital.hospitalName}
          </h3>
          <p className="mt-2 text-sm text-slate-600">{hospital.address}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${isParticipating ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
        >
          {isParticipating ? "Verified participant" : "Source-listed only"}
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Distance"
          value={
            Number.isFinite(Number(hospital.distance))
              ? `${Number(hospital.distance).toFixed(2)} km`
              : "Unavailable"
          }
        />
        <Stat
          label="Current services"
          value={isParticipating ? "Check with hospital" : "Not verified"}
        />
      </div>
      {hospital.source?.url && (
        <p className="mt-4 text-xs text-slate-500">
          Source:{" "}
          <a
            href={hospital.source.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="underline"
          >
            {hospital.source.name}
          </a>
          {hospital.source.retrievedAt &&
            ` · Retrieved ${new Date(hospital.source.retrievedAt).toLocaleDateString()}`}
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Link
          to={hospitalPath}
          state={{ hospital }}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          {isParticipating ? "View hospital" : "View listing"}{" "}
          <FiChevronRight />
        </Link>
      </div>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-3xl bg-slate-50 p-4">
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
  </div>
);

export default HospitalCard;
