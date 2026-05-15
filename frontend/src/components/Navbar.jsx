import { Link, useLocation } from "react-router-dom";
import { supabase } from "../services/supabase";
import { useAdmin } from "../context/AdminContext";
import CreditsBadge from "./CreditsBadge";

export default function Navbar({ session }) {
  const location = useLocation();
  const { isAdmin } = useAdmin();
  const userEmail = session?.user?.email;
  const avatarUrl = session?.user?.user_metadata?.avatar_url;

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function navLink(to, label) {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={`text-sm font-medium transition-colors ${
          active ? "text-indigo-600" : "text-gray-500 hover:text-gray-800"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 rounded-full p-1.5">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-800 whitespace-nowrap">Audio Transcriber</span>
          </div>
          <div className="flex items-center gap-5">
            {navLink("/dashboard", "Transcribe")}
            {navLink("/history", "History")}
            {navLink("/usage", "Usage")}
            {isAdmin && navLink("/admin", "Admin")}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <CreditsBadge />
          {avatarUrl && (
            <img src={avatarUrl} alt="avatar" className="w-8 h-8 rounded-full" />
          )}
          <span className="text-sm text-gray-600 hidden sm:block">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-500 transition-colors font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
