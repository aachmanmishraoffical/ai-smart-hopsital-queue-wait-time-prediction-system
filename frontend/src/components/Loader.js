const Loader = () => (
  <div
    role="status"
    aria-live="polite"
    className="loading-panel flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-8 shadow-sm"
  >
    <div
      aria-hidden="true"
      className="loading-spinner h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-100 border-t-emerald-700"
    />
    <p className="mt-4 text-sm font-medium text-slate-600">
      Loading information...
    </p>
  </div>
);

export default Loader;
