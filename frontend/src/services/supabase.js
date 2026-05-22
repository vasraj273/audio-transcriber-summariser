import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function saveTranscript({
  userId,
  audioName,
  transcript,
  summary,
  keyPoints,
  detectedLanguage,
  speakerTranscript,
  speakerCount,
  outputLanguage,
  focus,
  format,
  summaryLength,
  status = "completed",
  audioType = "",
  qualityScore = 1,
  qualityFlags = [],
  transcriptSegments = [],
  errorMessage = "",
}) {
  const payload = {
    user_id: userId,
    audio_name: audioName,
    transcript,
    summary,
    key_points: JSON.stringify(keyPoints),
    detected_language: detectedLanguage,
    speaker_transcript: speakerTranscript,
    speaker_count: speakerCount,
    status,
    audio_type: audioType,
    quality_score: qualityScore,
    quality_flags: JSON.stringify(qualityFlags),
    transcript_segments: JSON.stringify(transcriptSegments),
    error_message: errorMessage,
    output_language: outputLanguage,
    focus,
    format,
    summary_length: summaryLength,
  };

  const { error } = await supabase.from("transcripts").insert(payload);
  if (error && /speaker|status|audio_type|quality|transcript_segments|error_message/i.test(error.message)) {
    const {
      speaker_transcript,
      speaker_count,
      status,
      audio_type,
      quality_score,
      quality_flags,
      transcript_segments,
      error_message,
      ...fallbackPayload
    } = payload;
    const retry = await supabase.from("transcripts").insert(fallbackPayload);
    if (retry.error) console.error("[Supabase] Save failed:", retry.error.message);
    return;
  }

  if (error) console.error("[Supabase] Save failed:", error.message);
}

export async function fetchHistory(userId) {
  const fullColumns = "id, job_id, audio_name, transcript, summary, key_points, created_at, detected_language, output_language, focus, format, summary_length, speaker_transcript, speaker_count, status, error_message, audio_type, quality_score, quality_flags, duration_seconds, transcript_segments";
  const fallbackColumns = "id, audio_name, transcript, summary, key_points, created_at, detected_language, output_language, focus, format, summary_length";

  let { data, error } = await supabase
    .from("transcripts")
    .select(fullColumns)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error && /speaker|status|audio_type|quality|duration|transcript_segments|job_id|error_message/i.test(error.message)) {
    const retry = await supabase
      .from("transcripts")
      .select(fallbackColumns)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new Error("Failed to load history.");

  return (data || []).map((record) => ({
    ...record,
    key_points: parseJson(record.key_points, []),
    quality_flags: parseJson(record.quality_flags, []),
    transcript_segments: parseJson(record.transcript_segments, []),
    speaker_transcript: record.speaker_transcript || "",
    speaker_count: record.speaker_count || 1,
    status: record.status || "completed",
    audio_type: record.audio_type || "",
    quality_score: record.quality_score || 0,
    error_message: record.error_message || "",
    duration_seconds: record.duration_seconds || 0,
  }));
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function deleteTranscript(recordId) {
  const { error } = await supabase.from("transcripts").delete().eq("id", recordId);
  if (error) throw new Error(error.message || "Failed to delete transcript.");
}

export async function deleteTranscripts(recordIds) {
  if (!recordIds || recordIds.length === 0) return;
  const { error } = await supabase.from("transcripts").delete().in("id", recordIds);
  if (error) throw new Error(error.message || "Failed to delete transcripts.");
}

// ---------------------------------------------------------------------------
// SalesCall AI — leads CRUD. Writes directly from the browser using the
// user's authenticated supabase session (same pattern as transcripts above).
// Soft-fails with a console error on RLS / missing column issues — the UI
// caller decides how to surface the failure.
// ---------------------------------------------------------------------------

export async function createLead({ userId, lead }) {
  const payload = {
    owner_id: userId,
    lead_name: lead.lead_name || lead.customerName || "",
    email: lead.email || "",
    phone: lead.phone || "",
    company: lead.company || "",
    source: lead.source || "sales_call",
    assigned_to: lead.assigned_to || userId,
    lead_score: lead.lead_score ?? lead.leadScore ?? 0,
    lead_temperature: lead.lead_temperature || lead.leadTemperature || "cold",
    status: lead.status || "lead",
    followup_date: lead.followup_date || lead.followupDate || null,
    notes: lead.notes || "",
  };
  const { data, error } = await supabase.from("leads").insert(payload).select().single();
  if (error) throw new Error(error.message || "Could not create lead.");
  return data;
}

export async function createLeadFromAnalysis({ userId, analysis, transcriptId }) {
  const lead = await createLead({
    userId,
    lead: {
      lead_name: analysis.customerName || "Unknown Customer",
      company: analysis.company,
      lead_score: analysis.leadScore,
      lead_temperature: analysis.leadTemperature,
      followup_date: analysis.followupDate || null,
      notes: analysis.nextAction || "",
    },
  });

  if (transcriptId) {
    await supabase.from("transcripts").update({ lead_id: lead.id }).eq("id", transcriptId);
  }

  await persistCallAnalysis({ userId, leadId: lead.id, transcriptId, analysis });
  await persistTasksFromAnalysis({ userId, leadId: lead.id, analysis });

  return lead;
}

async function persistCallAnalysis({ userId, leadId, transcriptId, analysis }) {
  const payload = {
    owner_id: userId,
    lead_id: leadId,
    transcript_id: transcriptId || null,
    customer_name: analysis.customerName || "",
    company: analysis.company || "",
    sentiment: analysis.sentiment || "neutral",
    urgency: analysis.urgency || "unknown",
    lead_score: analysis.leadScore ?? 0,
    lead_temperature: analysis.leadTemperature || "cold",
    analysis,
  };
  const { error } = await supabase.from("call_analyses").insert(payload);
  if (error) console.error("[Supabase] call_analyses insert failed:", error.message);
}

async function persistTasksFromAnalysis({ userId, leadId, analysis }) {
  const tasks = Array.isArray(analysis.tasks) ? analysis.tasks : [];
  if (tasks.length === 0) return;
  const rows = tasks.map((t) => ({
    owner_id: userId,
    lead_id: leadId,
    task_type: t.type || "other",
    description: t.description,
    due_date: t.dueDate || null,
    status: "open",
    source: "ai",
  }));
  const { error } = await supabase.from("sales_tasks").insert(rows);
  if (error) console.error("[Supabase] sales_tasks insert failed:", error.message);
}

export async function fetchLeads(userId) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load leads.");
  return data || [];
}

export async function fetchLead(leadId) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (error) throw new Error(error.message || "Failed to load lead.");
  return data;
}

export async function updateLead(leadId, patch) {
  const { data, error } = await supabase
    .from("leads")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .select()
    .single();
  if (error) throw new Error(error.message || "Failed to update lead.");
  return data;
}

export async function deleteLead(leadId) {
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) throw new Error(error.message || "Failed to delete lead.");
}

export async function fetchLeadCallAnalyses(leadId) {
  const { data, error } = await supabase
    .from("call_analyses")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load call history.");
  return data || [];
}

export async function fetchLeadTasks(leadId) {
  const { data, error } = await supabase
    .from("sales_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load tasks.");
  return data || [];
}

// ---------------------------------------------------------------------------
// SalesCall AI — sales_tasks CRUD across all leads. Used by TasksPage.
// ---------------------------------------------------------------------------

export async function fetchAllTasks(userId) {
  // Manual join: sales_tasks.lead_id has no FK to leads.id in the migration,
  // so PostgREST cannot embed the relation. Fetch separately and merge.
  const { data: tasks, error: tasksError } = await supabase
    .from("sales_tasks")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (tasksError) throw new Error(tasksError.message || "Failed to load tasks.");

  const leadIds = Array.from(new Set((tasks || []).map((t) => t.lead_id).filter(Boolean)));
  let leadsById = {};
  if (leadIds.length > 0) {
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, lead_name, company")
      .in("id", leadIds);
    if (!leadsError && leads) {
      leadsById = Object.fromEntries(leads.map((l) => [l.id, l]));
    }
  }

  return (tasks || []).map((t) => ({
    ...t,
    leads: t.lead_id ? leadsById[t.lead_id] || null : null,
  }));
}

export async function createTask({ userId, leadId = null, taskType = "other", description, dueDate = null, source = "manual" }) {
  const payload = {
    owner_id: userId,
    lead_id: leadId,
    task_type: taskType,
    description,
    due_date: dueDate,
    status: "open",
    source,
  };
  const { data, error } = await supabase.from("sales_tasks").insert(payload).select().single();
  if (error) throw new Error(error.message || "Failed to create task.");
  return data;
}

export async function updateTask(taskId, patch) {
  const finalPatch = { ...patch };
  if (patch.status === "completed" && !patch.completed_at) {
    finalPatch.completed_at = new Date().toISOString();
  }
  if (patch.status === "open") {
    finalPatch.completed_at = null;
  }
  const { data, error } = await supabase
    .from("sales_tasks")
    .update(finalPatch)
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw new Error(error.message || "Failed to update task.");
  return data;
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from("sales_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message || "Failed to delete task.");
}

// ---------------------------------------------------------------------------
// SalesCall AI — KPI snapshot. Computed live from leads + sales_tasks +
// call_analyses. No dedicated `kpis` row needed at this stage — we aggregate
// at query time so the dashboard always reflects current state.
// ---------------------------------------------------------------------------

export async function fetchKpiSnapshot({ userId, periodStart, periodEnd }) {
  const startIso = periodStart ? new Date(periodStart).toISOString() : null;
  const endIso = periodEnd ? endOfDayIso(periodEnd) : null;

  const leadsQuery = supabase.from("leads").select("*").eq("owner_id", userId);
  const callsQuery = supabase.from("call_analyses").select("*").eq("owner_id", userId);
  const tasksQuery = supabase.from("sales_tasks").select("*").eq("owner_id", userId);

  if (startIso) {
    leadsQuery.gte("created_at", startIso);
    callsQuery.gte("created_at", startIso);
    tasksQuery.gte("created_at", startIso);
  }
  if (endIso) {
    leadsQuery.lte("created_at", endIso);
    callsQuery.lte("created_at", endIso);
    tasksQuery.lte("created_at", endIso);
  }

  const [leadsRes, callsRes, tasksRes] = await Promise.all([leadsQuery, callsQuery, tasksQuery]);

  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (callsRes.error) throw new Error(callsRes.error.message);
  if (tasksRes.error) throw new Error(tasksRes.error.message);

  const leads = leadsRes.data || [];
  const calls = callsRes.data || [];
  const tasks = tasksRes.data || [];

  const today = new Date().toISOString().slice(0, 10);
  const totalLeads = leads.length;
  const wonLeads = leads.filter((l) => l.status === "won").length;
  const lostLeads = leads.filter((l) => l.status === "lost").length;
  const closedLeads = wonLeads + lostLeads;
  const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0;
  const winRateOfTotal = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const avgLeadScore = totalLeads > 0
    ? Math.round(leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / totalLeads)
    : 0;

  const meetingsBooked = tasks.filter((t) => t.task_type === "meeting").length
    + leads.filter((l) => l.status === "demo").length;
  const proposalsSent = tasks.filter((t) => t.task_type === "proposal").length;
  const openTasks = tasks.filter((t) => t.status === "open").length;
  const overdueTasks = tasks.filter((t) => t.status === "open" && t.due_date && t.due_date < today).length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;

  return {
    leads,
    calls,
    tasks,
    metrics: {
      callsCompleted: calls.length,
      totalLeads,
      hotLeads: leads.filter((l) => l.lead_temperature === "hot").length,
      warmLeads: leads.filter((l) => l.lead_temperature === "warm").length,
      coldLeads: leads.filter((l) => l.lead_temperature === "cold").length,
      meetingsBooked,
      proposalsSent,
      wonLeads,
      lostLeads,
      conversionRate,
      winRateOfTotal,
      avgLeadScore,
      openTasks,
      overdueTasks,
      completedTasks,
    },
    funnel: {
      lead: leads.filter((l) => l.status === "lead").length,
      contacted: leads.filter((l) => l.status === "contacted").length,
      demo: leads.filter((l) => l.status === "demo").length,
      negotiation: leads.filter((l) => l.status === "negotiation").length,
      won: wonLeads,
      lost: lostLeads,
    },
    sentimentBreakdown: {
      positive: calls.filter((c) => c.sentiment === "positive").length,
      neutral: calls.filter((c) => c.sentiment === "neutral").length,
      negative: calls.filter((c) => c.sentiment === "negative").length,
    },
  };
}

function endOfDayIso(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// SalesCall AI — Objectives + Key Results (OKR) + KRA CRUD.
// ---------------------------------------------------------------------------

export async function fetchObjectives(userId) {
  const { data: objectives, error } = await supabase
    .from("objectives")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load objectives.");

  if (!objectives || objectives.length === 0) return [];

  const objectiveIds = objectives.map((o) => o.id);
  const { data: keyResults, error: krErr } = await supabase
    .from("key_results")
    .select("*")
    .in("objective_id", objectiveIds);
  if (krErr) throw new Error(krErr.message || "Failed to load key results.");

  const krsByObjective = {};
  for (const kr of keyResults || []) {
    if (!krsByObjective[kr.objective_id]) krsByObjective[kr.objective_id] = [];
    krsByObjective[kr.objective_id].push(kr);
  }
  return objectives.map((o) => ({
    ...o,
    key_results: (krsByObjective[o.id] || []).sort(
      (a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0)
    ),
  }));
}

export async function createObjective({ userId, title, description = "", periodStart = null, periodEnd = null }) {
  const payload = {
    owner_id: userId,
    title,
    description,
    period_start: periodStart,
    period_end: periodEnd,
  };
  const { data, error } = await supabase.from("objectives").insert(payload).select().single();
  if (error) throw new Error(error.message || "Failed to create objective.");
  return { ...data, key_results: [] };
}

export async function updateObjective(objectiveId, patch) {
  const { data, error } = await supabase
    .from("objectives")
    .update(patch)
    .eq("id", objectiveId)
    .select()
    .single();
  if (error) throw new Error(error.message || "Failed to update objective.");
  return data;
}

export async function deleteObjective(objectiveId) {
  const { error } = await supabase.from("objectives").delete().eq("id", objectiveId);
  if (error) throw new Error(error.message || "Failed to delete objective.");
}

export async function createKeyResult({ objectiveId, title, targetValue, unit = "" }) {
  const payload = {
    objective_id: objectiveId,
    title,
    target_value: targetValue,
    current_value: 0,
    unit,
  };
  const { data, error } = await supabase.from("key_results").insert(payload).select().single();
  if (error) throw new Error(error.message || "Failed to create key result.");
  return data;
}

export async function updateKeyResult(krId, patch) {
  const { data, error } = await supabase
    .from("key_results")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", krId)
    .select()
    .single();
  if (error) throw new Error(error.message || "Failed to update key result.");
  return data;
}

export async function deleteKeyResult(krId) {
  const { error } = await supabase.from("key_results").delete().eq("id", krId);
  if (error) throw new Error(error.message || "Failed to delete key result.");
}

export async function fetchKras(userId) {
  const { data, error } = await supabase
    .from("kras")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load KRAs.");
  return data || [];
}

export async function createKra({ userId, area, description = "", weight = 1 }) {
  const payload = { owner_id: userId, area, description, weight };
  const { data, error } = await supabase.from("kras").insert(payload).select().single();
  if (error) throw new Error(error.message || "Failed to create KRA.");
  return data;
}

export async function updateKra(kraId, patch) {
  const { data, error } = await supabase
    .from("kras")
    .update(patch)
    .eq("id", kraId)
    .select()
    .single();
  if (error) throw new Error(error.message || "Failed to update KRA.");
  return data;
}

export async function deleteKra(kraId) {
  const { error } = await supabase.from("kras").delete().eq("id", kraId);
  if (error) throw new Error(error.message || "Failed to delete KRA.");
}
