import { useState } from "react";
import api from "../services/api";
import { Link, useNavigate } from "react-router-dom";
import { FiActivity, FiEye, FiEyeOff } from "react-icons/fi";

const RegisterPage = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await api.post("/auth/register", form);
      localStorage.setItem("userToken", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      navigate("/hospitals");
    } catch (err) {
      setMessage(
        err.response?.data?.message ||
          (err.request
            ? "Could not reach the server. Check that the backend is running and try again."
            : "Registration failed. Please check your details and try again."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page access-scene relative flex min-h-screen items-center overflow-hidden bg-[#071827] px-4 py-8 text-white sm:px-6">
      <div className="access-grid pointer-events-none absolute inset-0 opacity-30" />
      <div className="access-glow access-glow-one pointer-events-none absolute -left-40 top-[-10rem] h-[32rem] w-[32rem] rounded-full" />
      <div className="access-glow access-glow-two pointer-events-none absolute -bottom-64 right-[-8rem] h-[38rem] w-[38rem] rounded-full" />
      <div className="relative mx-auto w-full max-w-lg">
        <Link to="/" className="mb-7 inline-flex items-center gap-3 text-sm font-semibold tracking-wide text-white/90">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300 text-[#09211a]"><FiActivity className="h-5 w-5" /></span>
          SMART HOSPITAL
        </Link>
        <div className="auth-card rounded-[30px] border border-white/10 bg-[#0b1d2a]/95 p-7 shadow-2xl sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Join the patient portal</p>
        <h1 className="mt-3 text-3xl font-bold text-white">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Create a patient account to request platform-issued tokens from
          verified participating providers and review your token history.
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <Input
            label="Name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={handleChange}
          />
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
          />
          <Input
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required={false}
            value={form.phone}
            onChange={handleChange}
          />
          <div className="block text-sm font-medium text-white/80">
            <label htmlFor="register-password">Password</label>
            <span className="relative mt-2 block">
              <input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={form.password}
                onChange={handleChange}
                required
                className="register-input w-full rounded-xl border border-white/10 bg-[#102638] px-4 py-3.5 pr-12 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 transition hover:text-white"
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </span>
          </div>
          <p className="-mt-4 text-xs text-slate-400">
            Use a password between 12 and 128 characters.
          </p>
          {message && (
            <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-200">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-300 px-6 py-3.5 text-sm font-semibold text-[#082018] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="mt-7 text-center text-sm text-white/55">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-emerald-200 transition hover:text-lime-200">
            Log in
          </Link>
        </p>
        </div>
      </div>
    </main>
  );
};

const Input = ({ label, required = true, ...props }) => (
  <label className="block text-sm font-medium text-white/80">
    {label}
    <input
      {...props}
      required={required}
      className="register-input mt-2 w-full rounded-xl border border-white/10 bg-[#102638] px-4 py-3.5 text-sm text-white outline-none transition focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/15"
    />
  </label>
);

export default RegisterPage;
