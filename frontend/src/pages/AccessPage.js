import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  FiActivity,
  FiArrowRight,
  FiArrowUpRight,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiHeart,
  FiMapPin,
  FiMenu,
  FiSearch,
  FiShield,
  FiUsers,
  FiX,
} from "react-icons/fi";

const featureCards = [
  {
    icon: <FiMapPin />,
    title: "Discover nearby hospitals",
    copy: "Explore location-based hospital listings around a place you choose.",
  },
  {
    icon: <FiSearch />,
    title: "Compare your options",
    copy: "Review available listing details and compare options for your visit.",
  },
  {
    icon: <FiCalendar />,
    title: "Manage appointment requests",
    copy: "Keep your requests and appointment history organized in one place.",
  },
  {
    icon: <FiClock />,
    title: "Access waiting-time insights",
    copy: "See estimates only when verified hospital data is available.",
  },
];

const steps = [
  {
    number: "01",
    icon: <FiMapPin />,
    title: "Choose a location",
    copy: "Share your location or search for a city, locality, or postal code.",
  },
  {
    number: "02",
    icon: <FiSearch />,
    title: "Explore nearby options",
    copy: "Browse hospitals returned by the available directory providers.",
  },
  {
    number: "03",
    icon: <FiCheckCircle />,
    title: "Plan your next step",
    copy: "Review the information provided and manage your visit in your account.",
  },
];

const AccessPage = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pageRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const revealItems = pageRef.current?.querySelectorAll(".reveal-on-scroll");
    if (!revealItems?.length) return undefined;

    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  if (localStorage.getItem("userToken")) {
    return <Navigate to="/hospitals" replace />;
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-page" ref={pageRef}>
      <header className={`landing-nav ${isScrolled ? "landing-nav-scrolled" : ""}`}>
        <div className="landing-nav-inner">
          <Link to="/" className="brand-mark" aria-label="Smart Hospital home">
            <span className="brand-icon"><FiHeart aria-hidden="true" /></span>
            <span>Smart<span>Hospital</span></span>
          </Link>

          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <FiX /> : <FiMenu />}
          </button>

          <nav
            id="landing-navigation"
            className={`landing-navigation ${menuOpen ? "landing-navigation-open" : ""}`}
            aria-label="Main navigation"
          >
            <a href="#home" onClick={closeMenu}>Home</a>
            <Link to="/hospitals" onClick={closeMenu}>Explore hospitals</Link>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#features" onClick={closeMenu}>Features</a>
            <div className="landing-nav-actions">
              <Link to="/login" className="nav-login" onClick={closeMenu}>Log in</Link>
              <Link to="/register" className="button button-small" onClick={closeMenu}>
                Get started <FiArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="home">
          <div className="hero-orb hero-orb-one" aria-hidden="true" />
          <div className="hero-orb hero-orb-two" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />
          <div className="landing-hero-inner">
            <div className="hero-copy">
              <p className="eyebrow hero-eyebrow">
                <span className="eyebrow-pulse" aria-hidden="true" />
                A smarter way to plan your care
              </p>
              <h1>
                Healthcare,
                <br />
                <span>Without the Guesswork.</span>
              </h1>
              <p className="hero-description">
                Find nearby hospitals, explore your options, and organize your
                next visit — all in one place.
              </p>
              <div className="hero-actions">
                <Link to="/hospitals" className="button button-primary">
                  <FiMapPin aria-hidden="true" /> Find nearby hospitals
                </Link>
                <Link to="/register" className="button button-secondary">
                  Get started <FiArrowRight aria-hidden="true" />
                </Link>
              </div>
              <div className="hero-assurance">
                <span><FiShield aria-hidden="true" /> Your location stays in your control</span>
                <span><FiCheckCircle aria-hidden="true" /> Clear, source-aware information</span>
              </div>
            </div>

            <div
              className="hero-artwork"
              role="img"
              aria-label="Illustration of hospital discovery and appointment management"
            >
              <div className="artwork-glow" aria-hidden="true" />
              <div className="artwork-orbit artwork-orbit-one" aria-hidden="true" />
              <div className="artwork-orbit artwork-orbit-two" aria-hidden="true" />
              <div className="artwork-map">
                <svg className="map-lines" viewBox="0 0 520 440" fill="none" aria-hidden="true">
                  <path d="M-12 98C87 89 75 167 175 159S276 77 367 107s97 92 170 89" />
                  <path d="M-28 287c86-20 118-101 207-89 103 14 99 93 189 93s90-58 177-53" />
                  <path d="M85-21c19 88-18 121 24 191s97 73 96 167 25 91 56 130" />
                  <path d="M372-30c-38 82 8 131-23 192s-47 107-14 164 31 81 20 141" />
                  <path d="M-5 220c60 2 95 2 143 43 56 48 80 47 145 21s100-6 147 20 77 21 102 14" />
                </svg>
                <svg className="artwork-waveform" viewBox="0 0 420 44" fill="none" aria-hidden="true">
                  <path d="M2 23h94l16-1 12-12 16 25 18-31 18 21 17-2h88l16-1 13-11 15 22 16-28 16 19 20-1h44" />
                </svg>
                <div className="map-route" aria-hidden="true" />
                <div className="map-location map-location-one" aria-hidden="true" />
                <div className="map-location map-location-two" aria-hidden="true" />
                <div className="location-marker" aria-hidden="true">
                  <span className="marker-pulse" />
                  <span className="marker-core"><FiMapPin /></span>
                </div>
                <div className="artwork-cross" aria-hidden="true"><FiActivity /></div>
              </div>

              <div className="float-card discovery-float">
                <span className="float-icon"><FiMapPin /></span>
                <span><strong>Hospital discovery</strong><small>Explore nearby options</small></span>
                <FiArrowUpRight className="float-arrow" aria-hidden="true" />
              </div>
              <div className="float-card appointment-float">
                <span className="float-icon float-icon-mint"><FiCalendar /></span>
                <span><strong>Appointment management</strong><small>Keep your visit organized</small></span>
              </div>
              <div className="artwork-caption"><span /> Thoughtful tools for your next visit</div>
            </div>
          </div>
          <a href="#features" className="hero-scroll-link" aria-label="Scroll to features">
            <span /> Explore what you can do
          </a>
        </section>

        <section className="landing-section features-section" id="features">
          <div className="section-inner">
            <div className="section-heading reveal-on-scroll">
              <p className="eyebrow eyebrow-light">Care planning, made clearer</p>
              <h2>Everything you need to take<br className="desktop-break" /> the next step.</h2>
              <p>Useful tools to help you explore, compare, and stay organized.</p>
            </div>
            <div className="feature-grid">
              {featureCards.map((feature, index) => (
                <article className="feature-card reveal-on-scroll" style={{ "--reveal-delay": `${index * 90}ms` }} key={feature.title}>
                  <span className="feature-icon">{feature.icon}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                  <span className="feature-card-arrow" aria-hidden="true"><FiArrowUpRight /></span>
                </article>
              ))}
            </div>
            <p className="section-footnote reveal-on-scroll">
              Appointment, availability, and waiting-time information is shown
              only when supported by participating providers or verified data.
            </p>
          </div>
        </section>

        <section className="landing-section steps-section" id="how-it-works">
          <div className="section-inner">
            <div className="section-heading reveal-on-scroll">
              <p className="eyebrow eyebrow-light">A simple place to start</p>
              <h2>Three steps to a clearer plan.</h2>
              <p>No guesswork. Just useful information, organized around you.</p>
            </div>
            <div className="steps-grid">
              {steps.map((step, index) => (
                <article className="step-card reveal-on-scroll" style={{ "--reveal-delay": `${index * 110}ms` }} key={step.number}>
                  <div className="step-topline"><span>{step.number}</span><span className="step-icon">{step.icon}</span></div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="discovery-section">
          <div className="discovery-panel reveal-on-scroll">
            <div className="discovery-content">
              <p className="eyebrow eyebrow-light">Explore with confidence</p>
              <h2>Your search starts<br />where you are.</h2>
              <p>
                Find hospital listings around your current location or search
                for a place. Compare the information available and open a
                listing for more details.
              </p>
              <Link to="/hospitals" className="button button-primary">
                Explore hospitals <FiArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="discovery-visual" aria-hidden="true">
              <div className="discovery-ring ring-one" />
              <div className="discovery-ring ring-two" />
              <div className="discovery-ring ring-three" />
              <div className="discovery-pin"><FiMapPin /></div>
              <span className="discovery-dot dot-one" />
              <span className="discovery-dot dot-two" />
              <span className="discovery-dot dot-three" />
              <div className="discovery-label"><FiMapPin /> Location-based search</div>
            </div>
          </div>
        </section>

        <section className="why-section">
          <div className="section-inner why-inner">
            <div className="why-heading reveal-on-scroll">
              <p className="eyebrow eyebrow-light">Why Smart Hospital</p>
              <h2>More clarity.<br /><span>Less to keep track of.</span></h2>
              <p>
                A calm, practical space to explore hospitals and keep the
                details of your visit together.
              </p>
            </div>
            <div className="why-list">
              <div className="why-item reveal-on-scroll">
                <span><FiMapPin /></span><div><h3>Search around your location</h3><p>Choose when and where to look for nearby listings.</p></div>
              </div>
              <div className="why-item reveal-on-scroll">
                <span><FiUsers /></span><div><h3>Explore with context</h3><p>Review listing details and their available source information.</p></div>
              </div>
              <div className="why-item reveal-on-scroll">
                <span><FiCalendar /></span><div><h3>Keep your visit organized</h3><p>Access your appointment requests and history from your account.</p></div>
              </div>
              <div className="why-item reveal-on-scroll">
                <span><FiShield /></span><div><h3>Know what information means</h3><p>Provider-dependent details are clearly distinguished from directory listings.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="cta-orb" aria-hidden="true" />
          <div className="final-cta-content reveal-on-scroll">
            <span className="cta-mark"><FiHeart /></span>
            <p className="eyebrow">A better way to plan ahead</p>
            <h2>Your next hospital visit starts here.</h2>
            <p>Explore nearby options and take the next step with more clarity.</p>
            <Link to="/hospitals" className="button button-dark">
              Explore nearby hospitals <FiArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Link to="/" className="brand-mark" aria-label="Smart Hospital home">
              <span className="brand-icon"><FiHeart aria-hidden="true" /></span>
              <span>Smart<span>Hospital</span></span>
            </Link>
            <p>Thoughtful tools for a clearer hospital visit.</p>
          </div>
          <nav aria-label="Footer navigation" className="footer-links">
            <a href="#home">Home</a>
            <Link to="/hospitals">Explore hospitals</Link>
            <a href="#how-it-works">How it works</a>
            <Link to="/login">Patient login</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Smart Hospital</span>
          <p>Not for emergencies or medical advice. Contact local emergency services in an emergency.</p>
        </div>
      </footer>
    </div>
  );
};

export default AccessPage;
