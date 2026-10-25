const FeatureCard = ({ title, description }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
    <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
  </div>
);

export default FeatureCard;
