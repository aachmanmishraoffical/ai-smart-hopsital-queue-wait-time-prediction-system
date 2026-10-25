import { Navigate, Outlet, useLocation } from "react-router-dom";

const ProtectedRoute = () => {
  const location = useLocation();
  const token = localStorage.getItem("userToken");
  return token ? (
    <Outlet />
  ) : (
    <Navigate
      to="/login"
      state={{ from: location.pathname }}
      replace
    />
  );
};

export default ProtectedRoute;
