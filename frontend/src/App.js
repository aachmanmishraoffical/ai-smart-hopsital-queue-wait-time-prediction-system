import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AccessPage from "./pages/AccessPage";
import HomePage from "./pages/HomePage";
import HospitalDetailsPage from "./pages/HospitalDetailsPage";
import AppointmentStatusPage from "./pages/AppointmentStatusPage";
import UserLoginPage from "./pages/UserLoginPage";
import RegisterPage from "./pages/RegisterPage";
import AppointmentHistoryPage from "./pages/AppointmentHistoryPage";
import TokenHistoryPage from "./pages/TokenHistoryPage";
import ProfilePage from "./pages/ProfilePage";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import RecommendationsPage from "./pages/RecommendationsPage";

function App() {
  const { pathname } = useLocation();
  const minimalPage = ["/", "/login", "/register"].includes(pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {!minimalPage && <Navbar />}
      <Routes>
        <Route path="/" element={<AccessPage />} />
        <Route path="/hospitals" element={<HomePage />} />
        <Route
          path="/hospitals/osm/:type/:recordId"
          element={<HospitalDetailsPage />}
        />
        <Route path="/hospitals/:id" element={<HospitalDetailsPage />} />
        <Route path="/hospital/:id" element={<HospitalDetailsPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/appointment/:token"
            element={<AppointmentStatusPage />}
          />
          <Route path="/tokens/:tokenCode" element={<TokenHistoryPage />} />
          <Route
            path="/appointments/history"
            element={<AppointmentHistoryPage />}
          />
          <Route path="/tokens" element={<TokenHistoryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="/login" element={<UserLoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
