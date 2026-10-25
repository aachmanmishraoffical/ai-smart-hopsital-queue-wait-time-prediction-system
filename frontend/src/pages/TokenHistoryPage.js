import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import Loader from "../components/Loader";

const TokenHistoryPage = () => {
  const { tokenCode } = useParams();
  const [tokens, setTokens] = useState([]);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadTokens = async () => {
      setLoading(true);
      setError("");
      if (tokenCode) setToken(null);
      else setTokens([]);
      try {
        const response = tokenCode
          ? await api.get(`/tokens/${encodeURIComponent(tokenCode)}`)
          : await api.get("/tokens/my");
        if (!active) return;
        if (tokenCode) setToken(response.data.token);
        else setTokens(response.data.tokens || []);
      } catch (requestError) {
        if (active) {
          setError(
            requestError.response?.data?.message ||
              "Unable to load your digital tokens.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadTokens();
    return () => {
      active = false;
    };
  }, [tokenCode]);

  if (loading) return <Loader />;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Patient portal
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              {tokenCode ? "Digital token details" : "My digital tokens"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Tokens are issued by this platform, not by the hospital. They do
              not book an appointment, guarantee a place in a hospital queue,
              or guarantee acceptance.
            </p>
          </div>
          <Link
            to="/hospitals"
            className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Find hospitals
          </Link>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </p>
        )}

        {tokenCode ? (
          token ? (
            <article className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
                Platform token
              </p>
              <p className="mt-2 break-all text-3xl font-bold text-slate-900">
                {token.tokenCode}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Detail
                  label="Hospital"
                  value={token.hospitalId?.hospitalName || "Unavailable"}
                />
                <Detail
                  label="Department"
                  value={token.department || "Unavailable"}
                />
                <Detail
                  label="Requested slot"
                  value={
                    token.requestedAt
                      ? new Date(token.requestedAt).toLocaleString()
                      : "No requested slot recorded"
                  }
                />
                <Detail
                  label="Provider record"
                  value={token.doctorId?.name || "Unavailable"}
                />
                <Detail
                  label="Issued"
                  value={new Date(token.createdAt).toLocaleString()}
                />
                <Detail label="Status" value={token.status} />
              </div>
              <p className="mt-6 text-sm leading-6 text-slate-700">
                Confirm directly with the hospital whether it accepts
                platform-issued tokens. No live queue position or wait time is
                associated with this token. A requested slot is informational
                and does not reserve an appointment.
              </p>
            </article>
          ) : null
        ) : tokens.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-slate-600">
            You do not have any platform-issued tokens yet.
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {tokens.map((item) => (
              <article
                key={item._id || item.tokenCode}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      {item.tokenCode}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">
                      {item.hospitalId?.hospitalName || "Hospital"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.department} · {item.doctorId?.name || "Provider"}
                    </p>
                    {item.requestedAt && (
                      <p className="mt-1 text-sm text-slate-500">
                        Requested slot:{" "}
                        {new Date(item.requestedAt).toLocaleString()}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium capitalize text-slate-700">
                    {item.status}
                  </span>
                </div>
                <Link
                  to={`/tokens/${encodeURIComponent(item.tokenCode)}`}
                  className="mt-4 inline-flex text-sm font-semibold text-emerald-800 underline"
                >
                  View token details
                </Link>
              </article>
            ))}
          </div>
        )}
        <Link
          to="/tokens"
          className="mt-8 inline-flex text-sm font-semibold text-slate-600 underline"
        >
          My tokens
        </Link>
      </section>
    </main>
  );
};

const Detail = ({ label, value }) => (
  <div className="rounded-xl bg-white p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p className="mt-1 break-words font-medium text-slate-900">{value}</p>
  </div>
);

export default TokenHistoryPage;
