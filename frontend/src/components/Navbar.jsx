import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../services/supabase";
import { useAdmin } from "../context/AdminContext";
import { useTheme } from "../context/ThemeContext";
import CreditsBadge from "./CreditsBadge";

export default function Navbar({ session }) {
  const location = useLocation();
  const { isAdmin } = useAdmin();
  const { theme, toggleTheme } = useTheme();
  const userEmail = session?.user?.email;
  const avatarUrl = session?.user?.user_metadata?.avatar_url;
  const [menuOpen, setMenuOpen] = useState(false);

  // Close mobile menu on route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function isActive(to, matchPrefix) {
    return matchPrefix
      ? location.pathname.startsWith(to)
      : location.pathname === to;
  }

  function navLink(to, label, matchPrefix = false) {
    const active = isActive(to, matchPrefix);
    return (
      <Link
        to={to}
        className={`relative inline-flex items-center px-3 py-1.5 rounded-lg text-[13.5px] font-medium transition-colors ${
          active
            ? "text-ink-900 bg-ink-100"
            : "text-ink-500 hover:text-ink-900 hover:bg-ink-50"
        }`}
      >
        {label}
      </Link>
    );
  }

  function mobileLink(to, label, matchPrefix = false) {
    const active = isActive(to, matchPrefix);
    return (
      <Link
        to={to}
        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
          active
            ? "text-ink-900 bg-ink-100"
            : "text-ink-700 hover:bg-ink-50"
        }`}
      >
        <span>{label}</span>
        {active && (
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
      </Link>
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-ink-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="app-container">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <Link to="/dashboard" className="group flex items-center gap-2.5">
              <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-ink-900 text-white">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3m-4 0h8M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" />
                </svg>
              </span>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-[14px] font-semibold text-ink-900 tracking-tight">
                  SalesCall <span className="text-brand-500">AI</span>
                </span>
                <span className="text-[10px] text-ink-400 mt-0.5">Sales intelligence</span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {navLink("/dashboard", "Transcribe")}
              {navLink("/sales-assistant", "Sales Assistant", true)}
              {navLink("/history", "History")}
              {navLink("/usage", "Usage")}
              {isAdmin && navLink("/admin", "Admin")}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="grid place-items-center w-9 h-9 rounded-xl border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 transition-colors"
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <CreditsBadge />
            {isAdmin && (
              <span className="pill pill-brand hidden sm:inline-flex">Admin</span>
            )}
            <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-ink-200">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-8 h-8 rounded-full ring-1 ring-ink-200"
                />
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[12.5px] font-medium text-ink-900 max-w-[160px] truncate">
                  {userEmail}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-[11px] text-ink-500 hover:text-danger-600 transition-colors text-left"
                >
                  Sign out
                </button>
              </div>
            </div>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="md:hidden grid place-items-center w-9 h-9 rounded-xl border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 transition-colors"
            >
              {menuOpen ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden pb-4 pt-1 border-t border-ink-200 mt-px">
            {(userEmail || avatarUrl) && (
              <div className="flex items-center gap-3 px-2 py-3">
                {avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="w-9 h-9 rounded-full ring-1 ring-ink-200"
                  />
                )}
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-[13px] font-semibold text-ink-900 truncate">
                    {userEmail}
                  </span>
                  {isAdmin && (
                    <span className="text-[11px] text-brand-600 mt-0.5">Admin</span>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1 pt-1">
              {mobileLink("/dashboard", "Transcribe")}
              {mobileLink("/sales-assistant", "Sales Assistant", true)}
              {mobileLink("/history", "History")}
              {mobileLink("/usage", "Usage")}
              {isAdmin && mobileLink("/admin", "Admin")}
            </div>
            <button
              onClick={handleLogout}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-danger-600 hover:bg-danger-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m0 0l4-4m-4 4l4 4M21 4v16" />
              </svg>
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
