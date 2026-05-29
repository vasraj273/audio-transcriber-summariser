# Audio Transcriber & Summariser — Project Context

## Overview
A full-stack AI app where users log in with Google, upload an audio file (MP3/WAV/M4A), and receive a transcript, summary, and key points. Transcription is by Google Gemini (primary) with Groq Whisper fallback; summarisation and reasoning by Groq Llama. Results download as PDF and persist to Supabase, viewable in a History page. Audio can also be sent through an integrated Telegram bot. The app is expanding into **SalesCall AI** — lead, task, and KPI tracking generated from call analysis.

---

## Deployment URLs
| Service | URL |
|---|---|
| Frontend (Vercel) | https://audio-transcriber-summariser.vercel.app |
| Backend (Render) | https://audio-transcriber-summariser.onrender.com |
| Supabase project | https://bvwjxezwenyjtmzddlsh.supabase.co |

---

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Tailwind CSS, deployed on Vercel |
| Backend | FastAPI (Python 3.11), deployed on Render free tier |
| Transcription | Google Gemini 2.5 Flash (primary) → Groq Whisper (`whisper-large-v3`) fallback |
| Summarisation / Reasoning | Groq Llama 3.3 70B (`llama-3.3-70b-versatile`) |
| Bot | Telegram bot (webhook on backend) |
| Async jobs | FastAPI BackgroundTasks + Supabase job rows |
| Auth | Supabase Google OAuth |
| Database | Supabase PostgreSQL |
| PDF | jsPDF v4 (frontend) |

---

## Project Structure
```
audio-transcriber-summariser/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, routes
│   ├── routes/
│   │   ├── process.py           # process_audio_file pipeline + POST /process
│   │   ├── jobs.py              # POST /jobs async processing + DB job rows
│   │   ├── telegram.py          # /telegram/webhook bot (reuses process pipeline)
│   │   ├── cron.py              # /cron/digest daily Telegram digests
│   │   ├── chat.py, analysis.py, admin.py, activity.py
│   │   └── history.py           # Unused (kept, not registered)
│   ├── services/
│   │   ├── gemini_service.py    # Primary transcription (Gemini 2.5 Flash)
│   │   ├── groq_service.py      # Whisper fallback + Llama summarise/translate/reasoning
│   │   ├── supabase_service.py  # Backend DB writes (transcripts, job rows, last_active)
│   │   ├── telegram_service.py, digest_service.py, actions_service.py
│   │   └── analytics_service.py, admin_service.py, topic_analysis_service.py
│   ├── models/schemas.py        # ProcessResponse pydantic model
│   ├── requirements.txt         # Pinned Python deps
│   ├── runtime.txt              # python-3.11.0 (for Render)
│   └── .env                     # GEMINI_API_KEY, GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY, ...
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx    # Google sign-in
│       │   ├── Dashboard.jsx    # Upload + results + Download PDF
│       │   └── HistoryPage.jsx  # Past transcripts
│       ├── components/
│       │   ├── Navbar.jsx       # Shared nav with Transcribe / History links
│       │   ├── AudioUploader.jsx
│       │   ├── TranscriptBox.jsx
│       │   ├── SummaryBox.jsx
│       │   ├── KeyPointsList.jsx
│       │   └── HistoryItem.jsx  # Expandable history card with PDF download
│       ├── services/
│       │   ├── supabase.js      # Supabase client + saveTranscript + fetchHistory
│       │   └── api.js           # processAudio (calls Render backend)
│       └── utils/
│           ├── downloadPDF.js   # jsPDF PDF generation
│           └── copyText.js      # Clipboard write with execCommand fallback
│   ├── .env                     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BACKEND_URL
│   └── vercel.json              # SPA rewrite rule (all routes → index.html)
```

---

## Architecture — Key Design Decisions

### 1. No end-user auth headers to the backend
The frontend never sends an `Authorization: Bearer` header to the cross-origin backend — that triggered a browser permission popup ("Access other apps and services on this device") in Chrome and Brave, breaking the app for users who clicked Block. The backend authenticates to Supabase with its own anon / service-role key, not the user's JWT.

### 2. Database writes happen on both sides
The Supabase JS client (`supabase.js`) writes transcripts, credits, leads, and tasks directly from the browser using the user's session. The backend ALSO writes Supabase directly (`supabase_service.py`) for async job rows (`/jobs`) and the Telegram flow, which have no browser session.

### 3. Single combined endpoint
`POST /process` does everything in one call: receives file → transcribes → summarises → returns result. The TRD originally had separate `/upload`, `/transcribe`, `/summarize` endpoints but a combined one is simpler for an MVP.

### 4. CORS is an explicit origin allowlist
`main.py` allows the Vercel domain + localhost (plus `ALLOWED_ORIGINS` env) with `allow_credentials=True`. Not a wildcard.

### 5. PDF generation is client-side
jsPDF runs entirely in the browser. No server involvement needed for PDF download.

### 6. Render free tier keep-alive
The backend sleeps after 15 minutes of inactivity. A `/ping` endpoint was added and a cron job on cron-job.org is intended to hit it every 10 minutes to keep it awake. **See pending tasks.**

### 7. Async jobs with DB persistence
`POST /jobs` saves a Supabase job row, runs `process_audio_file` in a FastAPI BackgroundTask, and updates the row (queued → processing → completed/failed). An in-memory `JOBS{}` dict is best-effort cache; the DB row is the source of truth (survives Render restarts). `POST /process` remains as a synchronous one-shot path.

### 8. Telegram integration
`/telegram/webhook` reuses the same `process_audio_file` pipeline. Each chat maps to a deterministic UUIDv5 user_id, so Telegram uploads land in their own History bucket. Adds PDF/email/ask/translate/calendar actions and a daily digest driven by `/cron/digest`.

### 9. SalesCall AI (current direction)
Call transcripts feed an analysis pass that creates `leads`, `call_analyses`, and `sales_tasks` rows; the frontend surfaces leads, tasks, and KPIs under `/sales-assistant/*`. CRUD is browser-side via `supabase.js`.

---

## Environment Variables

### Backend (set on Render dashboard)
```
GEMINI_API_KEY=...    ← primary transcription
GROQ_API_KEY=...
SUPABASE_URL=https://bvwjxezwenyjtmzddlsh.supabase.co
SUPABASE_KEY=eyJ...   ← must be the JWT-format anon key, NOT sb_publishable_
SUPABASE_SERVICE_ROLE_KEY=...   ← needed for RLS-protected writes (user_credits)
ALLOWED_ORIGINS=...   ← extra CORS origins, merged with built-in allowlist
TELEGRAM_BOT_TOKEN=...   ← Telegram bot (optional)
CRON_SECRET=...          ← guards /cron/digest
RESEND_API_KEY=..., EMAIL_FROM=...   ← Telegram email action (optional)
```

### Frontend (set on Vercel dashboard)
```
VITE_SUPABASE_URL=https://bvwjxezwenyjtmzddlsh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_BACKEND_URL=https://audio-transcriber-summariser.onrender.com
```

---

## Supabase Setup
- Google OAuth enabled under Authentication → Providers
- Redirect URLs include: `https://audio-transcriber-summariser.vercel.app/dashboard` and `http://localhost:5173/dashboard`
- `transcripts` table created with RLS disabled:
```sql
CREATE TABLE transcripts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  audio_name VARCHAR,
  transcript TEXT,
  summary TEXT,
  key_points TEXT,   -- stored as JSON string, parsed on read
  created_at TIMESTAMP DEFAULT now()
);
ALTER TABLE transcripts DISABLE ROW LEVEL SECURITY;
```

---

## Local Development

### Backend
```
cd backend
.\venv\Scripts\Activate.ps1   # activate virtual environment (Windows)
uvicorn main:app --reload      # runs on http://localhost:8000
```

### Frontend
```
cd frontend
npm run dev                    # runs on http://localhost:5173
```

---

## Pending Tasks
1. **Set up cron-job.org keep-alive** — go to cron-job.org, create a free account, add a cron job hitting `https://audio-transcriber-summariser.onrender.com/ping` every 10 minutes. Without this, the backend sleeps and the first request after idle will fail on mobile.
2. **Verify permission popup is gone** — after the latest push (removing auth headers), test on Chrome and Brave to confirm the "Access other apps and services" popup no longer appears.
3. **Test history page** — a recursive function naming bug was fixed in the last commit. Verify it now loads correctly. Note: old transcripts saved before this fix may not appear (wrong user_id format); any new upload will save and show correctly.

---

## Known Issues / Notes
- Render free tier sleeps after 15 min inactivity — first request can take 30–60s until cron-job.org is set up
- `history.py` is unused (not registered). `backend/supabase_service.py` IS now used (jobs + Telegram persistence)
- `assemblyai_service.py` exists but is not wired into the live pipeline (Gemini + Groq only)
- Credits are deducted client-side only — Telegram uploads currently bill 0 credits
- Python 3.14 (user's local version) caused C++ build tool errors with `pyiceberg`; the venv uses Python 3.11 on Render via `runtime.txt`
