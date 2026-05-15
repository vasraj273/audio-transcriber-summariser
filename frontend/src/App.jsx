import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./services/supabase";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import HistoryPage from "./pages/HistoryPage";
import UsagePage from "./pages/UsagePage";
import AdminPage from "./pages/AdminPage";
import { ProcessingJobsProvider } from "./context/ProcessingJobsContext";
import { CreditsProvider } from "./context/CreditsContext";
import { AdminProvider } from "./context/AdminContext";

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);


  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <CreditsProvider userId={session?.user?.id}>
        <AdminProvider userId={session?.user?.id}>
          <ProcessingJobsProvider>
            <Routes>
          <Route
            path="/"
            element={session ? <Navigate to="/dashboard" /> : <LoginPage />}
          />
          <Route
            path="/dashboard"
            element={session ? <Dashboard session={session} /> : <Navigate to="/" />}
          />
          <Route
            path="/history"
            element={session ? <HistoryPage session={session} /> : <Navigate to="/" />}
          />
          <Route
            path="/usage"
            element={session ? <UsagePage session={session} /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/*"
            element={session ? <AdminPage session={session} /> : <Navigate to="/" />}
          />
            </Routes>
          </ProcessingJobsProvider>
        </AdminProvider>
      </CreditsProvider>
    </BrowserRouter>
  );
}
