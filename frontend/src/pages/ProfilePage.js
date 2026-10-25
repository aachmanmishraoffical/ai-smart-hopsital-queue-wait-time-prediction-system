import { useEffect, useState } from "react";

const ProfilePage = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="rounded-[34px] bg-white p-10 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
        {user ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Card label="Name" value={user.name} />
            <Card label="Email" value={user.email} />
            <Card label="Phone" value={user.phone || "Not provided"} />
            <Card label="Role" value="Patient" />
          </div>
        ) : (
          <p className="mt-6 text-slate-600">No user is currently logged in.</p>
        )}
      </div>
    </main>
  );
};

const Card = ({ label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
    <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-3 text-lg font-semibold text-slate-900">{value}</p>
  </div>
);

export default ProfilePage;
