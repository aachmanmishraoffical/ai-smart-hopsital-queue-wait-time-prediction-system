import { useState } from "react";
import api from "../services/api";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiActivity, FiArrowLeft, FiEye, FiEyeOff, FiMapPin, FiShield } from "react-icons/fi";

const UserLoginPage = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await api.post("/auth/login", form);
      localStorage.setItem("userToken", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      setSuccess(true);
      window.setTimeout(() => {
        navigate({
          pathname: location.state?.from || "/hospitals",
          state: location.state?.hospital
            ? { hospital: location.state.hospital }
            : undefined,
        });
      }, 1100);
    } catch (err) {
      setMessage(err.response?.data?.message || "Login failed. Please check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="access-scene auth-page relative flex min-h-screen items-center overflow-hidden bg-[#071827] px-5 py-10 text-white sm:px-8">
      <div className="access-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="access-glow access-glow-one pointer-events-none absolute -left-40 top-[-10rem] h-[32rem] w-[32rem] rounded-full" />
      <div className="access-glow access-glow-two pointer-events-none absolute -bottom-64 right-[-8rem] h-[38rem] w-[38rem] rounded-full" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="access-intro">
          <Link to="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-wide text-white/90">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300 text-[#09211a]"><FiActivity className="h-5 w-5" /></span>
            SMART HOSPITAL
          </Link>
          <p className="mt-14 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Patient portal</p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.05] sm:text-6xl">Care that moves at <span className="font-normal text-emerald-200">your pace.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/65">Sign in to find nearby hospitals, review supported waiting-time estimates, and request platform-issued tokens from verified participating providers.</p>

          <div className="mt-10 grid max-w-lg gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <FiMapPin className="h-5 w-5 text-lime-200" />
              <p className="mt-4 text-sm font-semibold">Nearby care</p>
              <p className="mt-1 text-xs leading-5 text-white/50">Explore hospitals and departments around you.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <FiActivity className="h-5 w-5 text-emerald-200" />
              <p className="mt-4 text-sm font-semibold">Your tokens</p>
              <p className="mt-1 text-xs leading-5 text-white/50">Review digital tokens issued by this platform.</p>
            </div>
          </div>
        </section>

        <section className="access-options auth-login-card mx-auto w-full max-w-md">
          <div className="mb-7">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white"><FiArrowLeft /> Back to options</Link>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/70">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold">Patient login</h2>
            <p className="mt-2 text-sm text-white/50">Continue to your patient portal.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input label="Email address" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} />
            <label className="block text-sm font-medium text-white/80">
              Password
              <span className="relative mt-2 block">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/10 bg-[#0e211d] px-4 py-3.5 pr-12 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/15"
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/45 transition hover:text-white">
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </span>
            </label>
            {message && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-200">{message}</p>}
            <button type="submit" disabled={loading || success} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3.5 text-sm font-semibold text-[#082018] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? "Signing in..." : "Sign in to patient portal"}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-white/45"><FiShield className="text-emerald-200" /> Your account is protected</div>
          <p className="mt-8 text-center text-sm text-white/50">New here? <Link to="/register" className="font-semibold text-emerald-200 transition hover:text-lime-200">Create an account</Link></p>
        </section>
      </div>

      {success && (
        <div
          role="status"
          aria-live="polite"
          className="login-welcome fixed inset-0 z-20 flex items-center justify-center bg-[#04100d]/85 px-5 backdrop-blur-md"
        >
          <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-emerald-200/20 bg-[#0b1c17] p-9 text-center shadow-2xl">
            <span className="login-heartbeat mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200/30 bg-emerald-300/10 text-emerald-200">
              <FiActivity className="h-8 w-8" />
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 220 36"
              className="login-ecg mb-5 h-9 w-44 text-emerald-200"
              fill="none"
            >
              <path
                d="M2 18h54l10-10 13 20 13-26 13 16h25l9-8 10 16 10-8h59"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h2 className="text-2xl font-semibold">Welcome back!</h2>
            <p className="mt-2 text-sm text-white/55">
              Preparing your patient dashboard...
            </p>
          </div>
        </div>
      )}
    </main>
  );
};

const Input = ({ label, ...props }) => (
  <label className="block text-sm font-medium text-white/80">
    {label}
    <input
      {...props}
      required
      className="mt-2 w-full rounded-xl border border-white/10 bg-[#0e211d] px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/15"
    />
  </label>
);

export default UserLoginPage;
