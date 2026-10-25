import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiHeart, FiLogOut, FiMenu, FiX } from "react-icons/fi";
import NotificationBell from "./NotificationBell";

const Navbar = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoggedIn = Boolean(localStorage.getItem("userToken"));
  const closeMenu = () => setMenuOpen(false);

  const logout = () => {
    localStorage.removeItem("userToken");
    localStorage.removeItem("user");
    closeMenu();
    navigate("/");
  };

  return (
    <header className="patient-navbar">
      <div className="patient-navbar-inner">
        <Link to="/hospitals" className="patient-brand" onClick={closeMenu}>
          <span><FiHeart aria-hidden="true" /></span>
          Smart<span>Hospital</span>
        </Link>
        <button
          type="button"
          className="patient-menu-toggle"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="patient-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <FiX /> : <FiMenu />}
        </button>
        <nav
          id="patient-navigation"
          className={`patient-navigation ${menuOpen ? "patient-navigation-open" : ""}`}
          aria-label="Patient navigation"
        >
          <Link to="/hospitals" onClick={closeMenu}>Hospitals</Link>
          <Link to="/recommendations" onClick={closeMenu}>Nearby participants</Link>
          {isLoggedIn && <Link to="/tokens" onClick={closeMenu}>My tokens</Link>}
          {isLoggedIn && <Link to="/appointments/history" onClick={closeMenu}>Appointments</Link>}
          {!isLoggedIn && <Link to="/login" onClick={closeMenu}>Login</Link>}
          {!isLoggedIn && <Link to="/register" className="patient-nav-cta" onClick={closeMenu}>Get started</Link>}
          {isLoggedIn && <Link to="/profile" onClick={closeMenu}>Profile</Link>}
          {isLoggedIn && <NotificationBell />}
          {isLoggedIn && (
            <button
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              className="patient-logout"
            >
              <FiLogOut aria-hidden="true" /><span>Log out</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
