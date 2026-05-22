import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./services/supabase";
import { touchActive } from "./services/api";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import HistoryPage from "./pages/HistoryPage";
import UsagePage from "./pages/UsagePage";
import AdminPage from "./pages/AdminPage";
import SalesAssistantPage from "./pages/SalesAssistantPage";
import { ProcessingJobsProvider } from "./context/ProcessingJobsContext";
import { CreditsProvider } from "./context/CreditsContext";
import { AdminProvider } from "./context/AdminContext";
import { ThemeProvider } from "./context/ThemeContext";

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) touchActive(session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) touchActive(session.user.id);
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
    <ThemeProvider>
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
            path="/sales-assistant/*"
            element={session ? <SalesAssistantPage session={session} /> : <Navigate to="/" />}
          />
          <Route path="/leads" element={<Navigate to="/sales-assistant/leads" replace />} />
          <Route path="/tasks" element={<Navigate to="/sales-assistant/tasks" replace />} />
          <Route path="/kpi" element={<Navigate to="/sales-assistant/kpi" replace />} />
          <Route path="/okr" element={<Navigate to="/sales-assistant/okr" replace />} />
          <Route path="/analytics" element={<Navigate to="/sales-assistant" replace />} />
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
    </ThemeProvider>
  );
}
