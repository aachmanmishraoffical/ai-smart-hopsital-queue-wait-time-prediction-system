import { useEffect, useState } from "react";
import { FiBell } from "react-icons/fi";
import api from "../services/api";

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const authenticated = Boolean(localStorage.getItem("userToken"));

  useEffect(() => {
    if (!authenticated) return undefined;
    api
      .get("/notifications")
      .then((response) => setNotifications(response.data.notifications || []))
      .catch(() => setError("Notifications are unavailable."));
    return undefined;
  }, [authenticated]);

  const markRead = async (notification) => {
    if (notification.read) return;
    try {
      await api.put(`/notifications/${notification._id}/read`);
      setNotifications((items) =>
        items.map((item) =>
          item._id === notification._id ? { ...item, read: true } : item,
        ),
      );
      setError("");
    } catch {
      setError("Unable to update this notification.");
    }
  };

  const unread = notifications.filter(
    (notification) => !notification.read,
  ).length;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        title="Notifications"
        className="relative rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
      >
        <FiBell />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <p className="px-2 pb-2 text-sm font-semibold text-slate-900">
            Notifications
          </p>
          {error && (
            <p role="alert" className="p-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {notifications.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">No notifications yet.</p>
          ) : (
            notifications.slice(0, 5).map((notification) => (
              <button
                key={notification._id}
                onClick={() => markRead(notification)}
                className={`block w-full rounded-xl p-2 text-left ${notification.read ? "bg-white" : "bg-emerald-50"}`}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {notification.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {notification.message}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
