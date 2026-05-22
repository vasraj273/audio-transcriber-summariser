import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "../components/Navbar";
import SalesSidebar from "../components/sales/SalesSidebar";
import AnalyticsPage from "./AnalyticsPage";
import LeadsPage from "./LeadsPage";
import TasksPage from "./TasksPage";
import KPIPage from "./KPIPage";
import OKRPage from "./OKRPage";

export default function SalesAssistantPage({ session }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <Navbar session={session} />
      <div className="app-container flex flex-col gap-6 pt-6 pb-12 lg:flex-row lg:gap-8">
        <SalesSidebar />
        <main className="flex-1 min-w-0">
          <Routes>
            <Route index element={<AnalyticsPage session={session} embedded />} />
            <Route path="leads" element={<LeadsPage session={session} embedded />} />
            <Route path="tasks" element={<TasksPage session={session} embedded />} />
            <Route path="kpi" element={<KPIPage session={session} embedded />} />
            <Route path="okr" element={<OKRPage session={session} embedded />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
