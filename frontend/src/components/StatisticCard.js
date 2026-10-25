const StatisticCard = ({ value, label }) => (
  <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
    <p className="text-4xl font-bold">{value}</p>
    <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-300">
      {label}
    </p>
  </div>
);

export default StatisticCard;
