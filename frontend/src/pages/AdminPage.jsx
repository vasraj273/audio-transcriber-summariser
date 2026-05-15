import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import AdminSidebar from "../components/admin/AdminSidebar";
import AdminOverview from "../components/admin/AdminOverview";
import AdminUsers from "../components/admin/AdminUsers";
import AdminFailedJobs from "../components/admin/AdminFailedJobs";
import AdminApiMonitoring from "../components/admin/AdminApiMonitoring";
import AdminAnalytics from "../components/admin/AdminAnalytics";
import AdminSettings from "../components/admin/AdminSettings";
import { useAdmin } from "../context/AdminContext";

export default function AdminPage({ session }) {
  const { isAdmin, loading, checked } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (checked && !loading && !isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [checked, loading, isAdmin, navigate]);

  if (!checked || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar session={session} />
        <div className="flex items-center justify-center py-32 text-sm text-gray-500">
          Verifying admin access…
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-10 sm:px-6 lg:flex-row">
        <AdminSidebar />
        <main className="flex-1 min-w-0">
          <Routes>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="failed-jobs" element={<AdminFailedJobs />} />
            <Route path="api-monitoring" element={<AdminApiMonitoring />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
