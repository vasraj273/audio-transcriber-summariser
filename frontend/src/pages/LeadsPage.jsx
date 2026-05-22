import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import LeadDetailDrawer from "../components/LeadDetailDrawer";
import { fetchLeads, updateLead, deleteLead } from "../services/supabase";
import { friendlyError } from "../utils/errorMessage";
import { PageHeader, ErrorBanner } from "./AnalyticsPage";

const STAGE_OPTIONS = ["lead", "contacted", "demo", "negotiation", "won", "lost"];

const TEMP_PILL = {
  cold: "pill-brand",
  warm: "pill-warn",
  hot: "pill-danger",
};

const STAGE_PILL = {
  lead: "pill-neutral",
  contacted: "pill-brand",
  demo: "pill-brand",
  negotiation: "pill-warn",
  won: "pill-success",
  lost: "pill-danger",
};

export default function LeadsPage({ session, embedded = false }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tempFilter, setTempFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openLeadId, setOpenLeadId] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadLeads();
  }, [session?.user?.id]);

  async function loadLeads() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchLeads(session.user.id);
      setLeads(data);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleStageChange(lead, nextStatus) {
    try {
      const updated = await updateLead(lead.id, { status: nextStatus });
      setLeads((current) => current.map((l) => (l.id === lead.id ? updated : l)));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleDelete(leadId) {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    try {
      await deleteLead(leadId);
      setLeads((current) => current.filter((l) => l.id !== leadId));
      if (openLeadId === leadId) setOpenLeadId(null);
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (tempFilter !== "all" && l.lead_temperature !== tempFilter) return false;
      if (q) {
        const blob = `${l.lead_name || ""} ${l.company || ""} ${l.email || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [leads, statusFilter, tempFilter, search]);

  const stats = useMemo(() => {
    return {
      total: leads.length,
      hot: leads.filter((l) => l.lead_temperature === "hot").length,
      won: leads.filter((l) => l.status === "won").length,
      open: leads.filter((l) => !["won", "lost"].includes(l.status)).length,
    };
  }, [leads]);

  const content = (
    <main className={embedded ? "min-w-0" : "app-container pb-12"}>
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        subtitle="Customers extracted from sales calls. Save calls as leads from the Transcribe page."
        actions={
          <button onClick={loadLeads} className="btn btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4 20l5-5M20 4l-5 5" />
            </svg>
            Refresh
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 rise">
        <Stat label="Total leads" value={stats.total} />
        <Stat label="Hot" value={stats.hot} tone="danger" />
        <Stat label="Open" value={stats.open} tone="brand" />
        <Stat label="Won" value={stats.won} tone="success" />
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-center gap-3 rise rise-1">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search name, company, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="!w-auto"
        >
          <option value="all">All stages</option>
          {STAGE_OPTIONS.map((s) => (
            <option key={s} value={s}>{capitalize(s)}</option>
          ))}
        </select>
        <select
          value={tempFilter}
          onChange={(e) => setTempFilter(e.target.value)}
          className="!w-auto"
        >
          <option value="all">All temperatures</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
      </div>

      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <EmptyState hasLeads={leads.length > 0} />
      ) : (
        <div className="card overflow-hidden rise rise-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50">
                <tr className="border-b border-ink-200">
                  <Th>Lead</Th>
                  <Th>Company</Th>
                  <Th align="right">Score</Th>
                  <Th>Temp</Th>
                  <Th>Stage</Th>
                  <Th>Follow-up</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50/70 cursor-pointer transition-colors"
                    onClick={() => setOpenLeadId(lead.id)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-50 text-brand-700 text-[12px] font-semibold">
                          {(lead.lead_name || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-ink-900 font-medium leading-tight">{lead.lead_name || "Unknown"}</p>
                          <p className="text-[12px] text-ink-500 mt-0.5">{lead.email || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-ink-700">{lead.company || "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="num text-base">{lead.lead_score}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`pill ${TEMP_PILL[lead.lead_temperature] || TEMP_PILL.cold} uppercase text-[10px]`}>
                        {lead.lead_temperature}
                      </span>
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStageChange(lead, e.target.value)}
                          className="!w-auto !py-1.5 !pr-8 !pl-3 text-[12.5px] font-medium cursor-pointer"
                        >
                          {STAGE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{capitalize(s)}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-ink-600 font-mono">
                      {lead.followup_date || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        className="btn btn-danger-ghost !py-1.5 !px-3"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );

  const drawer = openLeadId && (
    <LeadDetailDrawer
      leadId={openLeadId}
      onClose={() => setOpenLeadId(null)}
      onUpdated={(updated) =>
        setLeads((current) => current.map((l) => (l.id === updated.id ? updated : l)))
      }
    />
  );

  if (embedded) return (<>{content}{drawer}</>);
  return (
    <div className="min-h-screen bg-ink-50">
      <Navbar session={session} />
      {content}
      {drawer}
    </div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th className={`px-5 py-3 text-${align} text-[11px] font-semibold tracking-wider uppercase text-ink-500`}>
      {children}
    </th>
  );
}

function Stat({ label, value, tone }) {
  const TONE = {
    danger: "text-danger-600",
    brand: "text-brand-600",
    success: "text-success-600",
  };
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className={`num text-[32px] leading-none mt-2 ${TONE[tone] || "text-ink-900"}`}>{value}</p>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="card p-6">
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-ink-50 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ hasLeads }) {
  return (
    <div className="card px-8 py-16 text-center">
      <div className="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-brand-50 text-brand-600 mb-4">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21M22 21V19C21.9986 17.1771 20.7635 15.5857 19 15.13M16 3.13C17.7699 3.58317 19.0078 5.17522 19.0078 7.005C19.0078 8.83478 17.7699 10.4268 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" />
        </svg>
      </div>
      <p className="h-display text-xl">
        {hasLeads ? "No matches" : "No leads yet"}
      </p>
      <p className="text-[13.5px] text-ink-500 mt-2 max-w-md mx-auto">
        {hasLeads
          ? "Try clearing the search or stage filter."
          : "Upload a sales call from the Transcribe page and click Save as Lead."}
      </p>
    </div>
  );
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
