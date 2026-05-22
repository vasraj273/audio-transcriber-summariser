-- SalesCall AI migration. Adds sales-specific tables alongside the existing
-- transcripts table. Run in Supabase SQL editor. Idempotent — safe to re-run.
--
-- Strategy: additive only. The transcripts table keeps its current shape; a
-- single new JSONB column stores the sales analysis blob produced by
-- backend/services/groq_service.py::analyze_sales_call. Lead, KPI, OKR, and
-- task data live in dedicated tables that reference auth.users.

-- 1. Extend transcripts with sales analysis payload ---------------------------
ALTER TABLE transcripts
  ADD COLUMN IF NOT EXISTS sales_analysis JSONB;

-- Optional FK so a transcript can be linked to a single lead.
ALTER TABLE transcripts
  ADD COLUMN IF NOT EXISTS lead_id UUID;

-- 2. Leads -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  lead_name VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  company VARCHAR,
  source VARCHAR,
  assigned_to UUID,
  lead_score INTEGER DEFAULT 0,
  lead_temperature VARCHAR DEFAULT 'cold',
  status VARCHAR DEFAULT 'lead',
  followup_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads (owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);

-- 3. Call analyses (one row per processed sales call) ------------------------
CREATE TABLE IF NOT EXISTS call_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transcript_id UUID,
  lead_id UUID,
  owner_id UUID NOT NULL,
  customer_name VARCHAR,
  company VARCHAR,
  sentiment VARCHAR,
  urgency VARCHAR,
  lead_score INTEGER DEFAULT 0,
  lead_temperature VARCHAR DEFAULT 'cold',
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_analyses_owner ON call_analyses (owner_id);
CREATE INDEX IF NOT EXISTS idx_call_analyses_lead ON call_analyses (lead_id);
CREATE INDEX IF NOT EXISTS idx_call_analyses_transcript ON call_analyses (transcript_id);

-- 4. Tasks (auto-generated from call analysis + manual) ----------------------
CREATE TABLE IF NOT EXISTS sales_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  lead_id UUID,
  call_analysis_id UUID,
  task_type VARCHAR DEFAULT 'other',
  description TEXT NOT NULL,
  due_date DATE,
  status VARCHAR DEFAULT 'open',
  source VARCHAR DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sales_tasks_owner ON sales_tasks (owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_tasks_lead ON sales_tasks (lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_tasks_status ON sales_tasks (status);

-- 5. KPIs (rolling per-user metrics; one row per metric per period) ----------
CREATE TABLE IF NOT EXISTS kpis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  metric VARCHAR NOT NULL,
  value NUMERIC DEFAULT 0,
  target NUMERIC,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (owner_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_kpis_owner_period ON kpis (owner_id, period_start);

-- 6. KRAs (manager-assigned key responsibility areas) ------------------------
CREATE TABLE IF NOT EXISTS kras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  assigned_by UUID,
  area VARCHAR NOT NULL,
  description TEXT,
  weight NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kras_owner ON kras (owner_id);

-- 7. OKR — Objectives + Key Results ------------------------------------------
CREATE TABLE IF NOT EXISTS objectives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS key_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  objective_id UUID NOT NULL REFERENCES objectives (id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  target_value NUMERIC,
  current_value NUMERIC DEFAULT 0,
  unit VARCHAR,
  progress NUMERIC GENERATED ALWAYS AS (
    CASE WHEN target_value IS NULL OR target_value = 0 THEN 0
         ELSE LEAST(100, GREATEST(0, (current_value / target_value) * 100))
    END
  ) STORED,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objectives_owner ON objectives (owner_id);
CREATE INDEX IF NOT EXISTS idx_key_results_objective ON key_results (objective_id);

-- 8. Notifications -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  kind VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  body TEXT,
  link VARCHAR,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_unread
  ON notifications (owner_id) WHERE read_at IS NULL;

-- 9. RLS — disabled to match the existing transcripts table convention -------
-- Per CLAUDE.md, RLS is off on transcripts and writes go through the backend
-- service-role client / authenticated session. Keep the same posture here.
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_analyses DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE kpis DISABLE ROW LEVEL SECURITY;
ALTER TABLE kras DISABLE ROW LEVEL SECURITY;
ALTER TABLE objectives DISABLE ROW LEVEL SECURITY;
ALTER TABLE key_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
