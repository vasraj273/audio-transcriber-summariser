# Audio Transcriber & Summariser - Agent Handoff

## Overview
Full-stack learning project for uploading audio, transcribing it, summarising it with AI, chatting about the audio, exporting PDFs, saving transcript history, and comparing/merging past transcripts. The owner is a beginner developer, so prefer clear code and explain non-obvious changes.

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, Python |
| Transcription | AssemblyAI (`speech_model=best`) with native speaker diarization |
| LLM | Groq Llama `llama-3.3-70b-versatile` (summaries, chat, compare/merge, fallback speaker inference) |
| Auth | Supabase Google OAuth |
| DB | Supabase PostgreSQL |
| PDF | jsPDF v4, jspdf-autotable |
| Markdown | react-markdown, remark-gfm |

## Deployment
| Service | URL |
|---|---|
| Frontend | https://audio-transcriber-summariser.vercel.app |
| Backend | https://audio-transcriber-summariser.onrender.com |
| Database | Supabase project `bvwjxezwenyjtmzddlsh` |

## Project Structure
```text
backend/
  main.py
  routes/process.py        # legacy sync /process plus shared processor
  routes/jobs.py           # POST /jobs, GET /jobs/{job_id}
  routes/chat.py
  routes/analysis.py       # compare/merge endpoints
  routes/admin.py          # admin analytics + monitoring
  routes/history.py        # stale/unused route
  routes/telegram.py       # POST /telegram/webhook + GET /telegram/set-webhook (V1→V4)
  routes/cron.py           # POST /cron/digest — header-secret guarded scheduler entry
  services/assemblyai_service.py  # transcription via AssemblyAI (current engine)
  services/groq_service.py        # summaries, chat, compare/merge, fallback infer_speakers, _build_speaker_transcript helper
  services/supabase_service.py
  services/analytics_service.py
  services/admin_service.py
  services/telegram_service.py     # bot client, send_message, edit_message_text, send_document, format_result_reply, format_actions_reply, build_ics, help/welcome text, urgent badge
  services/actions_service.py      # V3 extract_actions (second LLM pass) + action_items CRUD + mark_urgent_for_transcript
  services/digest_service.py       # V4 build_today_digest, save/get_cached_digest, should_send_now, parse_digest_time, telegram_chat_prefs helpers
  services/productivity_service.py # V4 compute_score (with insufficient_data + work_recordings)
  services/topic_analysis_service.py # V4 LLM extract_topics, refresh_topic_window, recurring_themes, latest_people
  services/reminder_service.py     # scaffold only (planned cron-pushed reminders)
  models/schemas.py
  requirements.txt
  runtime.txt

frontend/src/
  context/ProcessingJobsContext.jsx
  pages/LoginPage.jsx
  pages/Dashboard.jsx
  pages/HistoryPage.jsx
  components/AudioUploader.jsx
  components/AudioPlayer.jsx
  components/ChatPanel.jsx
  components/CustomizationPanel.jsx
  components/HistoryItem.jsx
  components/KeyPointsList.jsx
  components/Markdown.jsx
  components/Navbar.jsx
  components/SpeakerModeToggle.jsx
  components/SummaryBox.jsx
  components/TranscriptAnalysisModal.jsx
  components/TranscriptBox.jsx
  components/TranscriptSegment.jsx
  components/TranscriptViewer.jsx
  services/api.js
  services/supabase.js
  utils/copyText.js
  utils/downloadPDF.js
```

## Features Built
- Google sign-in via Supabase OAuth.
- Audio upload via drag/drop or file picker.
- Supported upload types: MP3, WAV, M4A.
- Backend upload limit: 25MB.
- Job-based transcription flow: `POST /jobs` starts processing and `GET /jobs/{job_id}` polls status.
- Processing rows are persisted in Supabase with queued/processing/completed/failed states.
- Frontend has `ProcessingJobsContext` and localStorage recovery for active job IDs.
- Users can navigate from Transcribe to History while processing continues.
- AssemblyAI transcription with native diarization, utterance-level timestamps, automatic language detection.
- AI summary and key points from Groq Llama.
- Audio quality/type gate detects likely music/song or noisy unsupported audio.
- Song/noisy inputs show a clean warning instead of rendering gibberish transcripts.
- Output language, summary focus, output format, summary length, and custom focus options.
- Detected source language and audio type metadata shown in results.
- Markdown rendering for summaries, key points, transcript text, chat answers, history details, and analysis output.
- PDF export for normal transcript reports.
- PDF export supports markdown tables through `jspdf-autotable`.
- Saved transcript history in Supabase.
- History page shows status badges and auto-refreshes while active jobs are processing.
- History page supports selecting completed transcripts.
- Compare selected transcripts through backend `/analysis/compare`.
- Merge selected transcripts through backend `/analysis/merge`.
- Compare/merge output opens in `TranscriptAnalysisModal`.
- Merged notes modal has professional PDF download.
- Merged PDF includes clean metadata, unique source titles, languages, duration, speaker summary, markdown sections, tables, page breaks, and footer.
- Session-only chat over transcript/summary.
- Backend `/chat` answers only from transcript/summary.
- Backend `/ping` exists for keep-alive services.
- Speaker labels come from AssemblyAI native diarization (letters A/B/C mapped to `Speaker 1/2/3`); Groq Llama `infer_speakers` is kept only as fallback when no utterances are returned.
- Backend assigns `speaker` metadata directly onto timestamped transcript segments.
- Synced transcript playback using uploaded local browser file.
- Audio player below transcript with play/pause, seek bar, time display, speed control, and keyboard shortcuts.
- Live transcript highlighting while audio plays.
- Clicking a transcript segment seeks audio to that timestamp and continues playback.
- Active transcript segment auto-scrolls smoothly into view.
- Transcript UI has `Synced` and `Plain` views.
- `Speaker Mode` toggle shows speaker labels inline in both Synced and Plain views.
- Main navbar is sticky globally.
- Dashboard and History page headers/action bars are sticky under the navbar.

## Architecture Decisions
- Backend now has two processing paths:
  - Legacy synchronous `/process` still works.
  - New job path `/jobs` is the main UX path.
- Backend writes processing/history rows to Supabase for job persistence.
- Frontend still reads history directly from Supabase.
- Backend CORS is open with `allow_origins=["*"]` and `allow_credentials=False`.
- Frontend still avoids Authorization headers to backend fetches.
- Uploaded audio is not stored. Synced playback uses the selected browser file object URL.
- Saved history does not support audio playback because audio files are not persisted.
- AssemblyAI is the source of both timestamps and speaker labels. Groq Llama is no longer involved in transcription itself, only downstream text tasks (summary, chat, compare, merge) and as a fallback speaker labeller when AssemblyAI returns no utterances.
- `assemblyai_service.transcribe_audio()` preserves the old return contract `{text, language, segments, duration}` so `routes/process.py::process_audio_file` did not need restructuring. The `segments` list now additionally carries a `speaker` field per segment.
- `routes/process.py::_resolve_speakers` short-circuits the LLM speaker step when segments already carry a `speaker` field, and builds `speaker_transcript` directly via `groq_service._build_speaker_transcript`.
- `routes/process.py::_transcribe_with_fallback` wraps the transcription stage: tries AssemblyAI first, automatically falls back to Groq Whisper (`groq_service.transcribe_audio`) on any exception so transient AssemblyAI failures, missing keys, or quota exhaustion do not cause the whole job to fail. Only if BOTH engines fail does the job go to `failed`. The Groq fallback returns segments without a `speaker` field, so `_resolve_speakers` then falls through to LLM-based `infer_speakers` and the user still sees speaker labels (LLM-inferred rather than native diarization).
- AssemblyAI key check is lazy (`_ensure_configured`) so the FastAPI app boots even when the key is missing; only the actual transcription request fails, with a clear `RuntimeError` that is then surfaced via `_run_job` into the Supabase `error_message` column.
- Detected language is read from `transcript.json_response["language_code"]` because the AssemblyAI SDK `Transcript` wrapper does not expose `language_code` as a property.
- Music/noisy detection is heuristic over transcript text/segments, not true waveform analysis.
- Compare/merge analysis is generated by Groq Llama from selected history records.

## Environment Variables
Backend:
- `GROQ_API_KEY` (summaries, chat, compare/merge, fallback speaker inference)
- `ASSEMBLYAI_API_KEY` (transcription engine — required for `/process` and `/jobs` to succeed)
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ALLOWED_ORIGINS`

Frontend:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BACKEND_URL`

## Supabase Schema
Table: `transcripts`

Known columns:
```sql
id UUID PRIMARY KEY,
job_id UUID,
user_id UUID,
audio_name VARCHAR,
status TEXT,
error_message TEXT,
transcript TEXT,
summary TEXT,
key_points TEXT,
detected_language TEXT,
output_language TEXT,
focus TEXT,
format TEXT,
summary_length TEXT,
speaker_transcript TEXT,
speaker_count INTEGER,
audio_type TEXT,
quality_score NUMERIC,
quality_flags TEXT,
duration_seconds NUMERIC,
transcript_segments TEXT,
created_at TIMESTAMP DEFAULT now()
```

Optional table:
```sql
transcript_analyses (
  id UUID PRIMARY KEY,
  user_id UUID,
  analysis_type TEXT,
  source_transcript_ids TEXT,
  title TEXT,
  result TEXT,
  created_at TIMESTAMP DEFAULT now()
)
```

Migration file:
- `docs/supabase_processing_migration.sql`

Notes:
- `key_points`, `quality_flags`, and `transcript_segments` are JSON-stringified text columns.
- `transcript_segments` are saved for metadata/history, but history playback still cannot work without stored audio.

## Local Development
Backend:
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

Frontend:
```powershell
cd frontend
npm.cmd run dev
```

Useful checks:
```powershell
npm.cmd run build
.\backend\venv\Scripts\python.exe -m compileall backend\main.py backend\models backend\routes backend\services
git diff --check
```

## Pending Tasks
1. **Add `ASSEMBLYAI_API_KEY` to the Render dashboard** and trigger a redeploy. Local `backend/.env` already has it; Render does not pick up the local `.env`. Without this, every job goes straight to `failed` with `error_message` "ASSEMBLYAI_API_KEY is not set...".
2. Smoke-test a short multi-speaker clip after the Render env var is set. Confirm logs print:
   - `AssemblyAI configured (key length=32).`
   - `AssemblyAI transcription starting: <file>`
   - `AssemblyAI transcription complete: id=... language=... segments=N duration=...s`
3. Run/confirm `docs/supabase_processing_migration.sql` in Supabase before relying on job persistence.
3a. **Run `docs/supabase_credits_migration.sql` in Supabase** — creates `user_credits` table and adds `credits_used` + `credits_refunded` to `transcripts`. Without this the credit/usage feature throws on first load.
3b. Harden `user_credits` access with RLS + Supabase RPC for deduction/refund so the anon browser key cannot tamper with any other user's row. Currently the feature is honour-system trustworthy only because the schema is shipped with RLS disabled to match `transcripts`.
4. Set up cron-job.org keep-alive hitting `https://audio-transcriber-summariser.onrender.com/ping` every 10 minutes.
5. Spot-check Brave/Chrome permission popup remains gone.
6. Test real uploads after migration: speech, song/music, noisy audio, multi-speaker meeting.
7. Test route navigation during processing and refresh recovery.
8. Test compare/merge on long real history records.
9. Decide whether audio files should be stored later for history playback.
10. Consider offloading the synchronous `aai.Transcriber().transcribe(...)` call to `run_in_executor` so it does not block the FastAPI event loop on Render free tier.
11. Consider background queue/worker if Render request lifetime becomes a problem for long files.
12. Consider code-splitting frontend because Vite warns the main bundle is over 500 kB.

## Gotchas
- Render free tier can cold start for 30-60 seconds.
- Backend job processing uses FastAPI `BackgroundTasks`; it is okay for MVP but not a durable queue if the server restarts mid-job.
- Supabase backend key must be JWT-style anon/service key compatible with the Python client.
- Frontend Supabase anon key can be `sb_publishable_`.
- Python 3.14 caused local install trouble before; Render pins Python through `runtime.txt`.
- Local venv may point to Python 3.14 on this machine even though Render uses the pinned runtime.
- `history.py` is stale/unused; frontend history reads directly from Supabase.
- Old history rows may have null status/quality/speaker columns; UI should tolerate this.
- Do not add backend auth headers to frontend backend fetches unless the permission-popup issue is re-evaluated.
- Do not remove markdown table overflow wrappers; long tables can break mobile layout.
- PDF strips inline markdown bold because jsPDF body text does not switch fonts mid-line.
- jsPDF default fonts have limited Unicode support; multilingual PDFs may not render all scripts perfectly.
- Synced playback only works immediately after upload because the selected browser file is the audio source.
- Speaker labels come from real AssemblyAI diarization on new uploads. Old history rows saved before the AssemblyAI switch still carry Llama-inferred labels and will not retroactively improve.
- AssemblyAI free tier is capped at 5 hours/month; long testing sessions will exhaust it.
- AssemblyAI's `Transcriber().transcribe(...)` is a blocking call (upload + poll) that can run 30-120s for short clips. Currently called synchronously inside the `/jobs` background task — fine for MVP, but it blocks the FastAPI event loop on Render free tier (single worker).
- AssemblyAI utterance/word timestamps are in **milliseconds**; `_ms_to_seconds` converts them. `audio_duration` is already in seconds and is not converted.
- AssemblyAI segment shape produced by `assemblyai_service`: `{start: float seconds, end: float seconds, text: str, speaker: "Speaker N"}`. The `speaker` field is always present (defaults to `"Speaker 1"` for single-speaker audio).
- Groq Whisper `transcribe_audio` still exists inside `services/groq_service.py` but is unused. Kept as an emergency rollback path — swap the import in `routes/process.py` back to `from services.groq_service import transcribe_audio` to revert.
- Music/noisy detection is heuristic and may need tuning after real samples.
- Sticky headers use `top-[61px]`; revisit if navbar height changes significantly.
- Keep code simple and explain changes clearly for the owner.

## Current Validation Status
- Frontend production build was run successfully with `npm.cmd run build`.
- Backend compile check was run successfully with the venv Python.
- `git diff --check` was run successfully earlier in the session.
- AssemblyAI integration: code-complete and locally bootable. **Not yet smoke-tested end-to-end** — pending `ASSEMBLYAI_API_KEY` being added to the Render dashboard (it is already present in `backend/.env`).

## Recent Session Log

### AssemblyAI Integration (transcription engine swap)
- Goal: replace Groq Whisper with AssemblyAI for the transcription layer only, preserving sync transcript, speaker mode, timestamps, compare/merge, history, PDF, summaries, UI.
- Files touched:
  - **NEW** `backend/services/assemblyai_service.py` — wraps the AssemblyAI Python SDK; same return contract as the old `groq_service.transcribe_audio`.
  - **EDIT** `backend/routes/process.py` — swapped import to `from services.assemblyai_service import transcribe_audio`; added `_resolve_speakers` to use native diarization first, fall back to `groq_service.infer_speakers` only when segments lack speaker info.
  - **EDIT** `backend/models/schemas.py` — added `duration_seconds: float = 0.0` to `ProcessResponse` and `JobStatusResponse` (was being silently stripped by Pydantic).
  - **EDIT** `backend/requirements.txt` — added `assemblyai==0.35.1`.
- Frontend, jobs route, Supabase service, schemas (other than `duration_seconds`), PDF, history, UI: **unchanged**.

### Debug Fix Session (after first integration attempt failed)
- Symptom: every job went straight to `failed` with "Processing failed".
- Root cause: `assemblyai_service.py` originally raised `RuntimeError` at module import if `ASSEMBLYAI_API_KEY` was missing, killing the FastAPI app at startup on Render (where the local `.env` is not deployed).
- Secondary bugs found and fixed in the same pass:
  - `transcript.language_code` is not exposed as a property on the AssemblyAI SDK's `Transcript` wrapper. Switched to `transcript.json_response["language_code"]`.
  - `duration_seconds` was present in the dict returned by `process_audio_file` but missing from the Pydantic response models. Added to both `ProcessResponse` and `JobStatusResponse`.
- Fix applied: key check is now lazy (`_ensure_configured()` runs on first transcription request, not at import); `logging.INFO` instrumentation added for configure/start/complete/error so future failures surface a clear error_message in Supabase + Render logs.
- Final manual step still required: add `ASSEMBLYAI_API_KEY` to the Render dashboard and redeploy.

### Fallback Layer (transcription resilience)
- Added `_transcribe_with_fallback` helper in `backend/routes/process.py`.
- Order: AssemblyAI first → Groq Whisper on any AssemblyAI exception → final `RuntimeError` only if both fail.
- `process_audio_file` now calls the helper instead of AssemblyAI directly.
- Production logging via `logging` module: INFO on pipeline start + Groq fallback success; WARNING on AssemblyAI failure; ERROR (`logger.exception`) when both engines fail. No `print()` statements anywhere. No temporary debug logs.
- Net effect: Render env-var-still-missing, AssemblyAI free-tier exhaustion, transient network outages, or AssemblyAI-specific format quirks no longer surface as "Processing failed" — they degrade silently to Groq Whisper transcription. Speaker mode is preserved either way (native diarization on AssemblyAI path, Llama-inferred on Groq path).

### History card action gating
- New helper `frontend/src/utils/recordStatus.js` exposes `getRecordState(record)` returning `"completed" | "failed" | "processing" | "queued" | "unknown"`, plus `isRecordCompleted(record)` (completed AND transcript text present). Single source of truth for action-button visibility across the History page.
- `HistoryItem.jsx` now hides PDF + View Details unless the record is `completed`. The expanded summary/key-points/transcript panel is also gated by `completed && expanded` so it can never render an empty body for partial rows.
- Failed records render a destructive `Delete` action (with `window.confirm` guard) instead of dead buttons. `error_message` is surfaced inline in red beneath the badges so users know why the job failed. Processing/queued records render a small italic `Processing…` indicator in the action area.
- Retry was intentionally **not** implemented because uploaded audio is not persisted server-side — a "retry" would always require the user to re-upload from the Dashboard, which is what the Transcribe page already does.
- Delete goes through `frontend/src/services/supabase.js::deleteTranscript(recordId)` which performs a direct row delete via the Supabase JS client. `HistoryPage.handleDelete` optimistically removes the row from local state and prunes it from the selection list. No backend route required.
- Compare/merge selection logic is unchanged: `HistoryPage` still only sets `selectable` for records where `status === "completed" && record.transcript`, so failed/processing/queued cards still cannot enter compare/merge.
- Frontend build (`npm.cmd run build`) passes after these changes.

### Credit / Usage System
- Storage: new Supabase table `user_credits` (`user_id` PK, `total_credits`, `used_credits`, `last_reset_at`, `plan`, `created_at`, `updated_at`). Two new columns on `transcripts`: `credits_used INTEGER DEFAULT 0`, `credits_refunded BOOLEAN DEFAULT FALSE`. Migration file: `docs/supabase_credits_migration.sql` — must be run in Supabase SQL editor before the feature works.
- Rules live in `frontend/src/utils/credits.js` (`CREDIT_RULES`): new-user grant 100, cost 2 credits per minute, warning threshold 20, daily reset (UTC), plan `free`. Centralised — bump rates or plan caps here.
- Formula: `Math.max(1, Math.ceil(durationSeconds / 60 * creditsPerMinute))`. Even sub-minute audio costs 1 credit so the system can't be gamed with tiny clips.
- Pre-flight duration: `frontend/src/utils/audioMeta.js::readAudioDuration(file)` uses a hidden `<audio preload="metadata">` element with an object URL.
- State: `CreditsProvider` (in `frontend/src/context/CreditsContext.jsx`) is mounted in `App.jsx` OUTSIDE `ProcessingJobsProvider` because the jobs provider calls `useCredits().refund(...)` when a polled job flips to `failed`. Provider must remain in that order.
- Daily reset: `fetchOrCreateUserCredits` checks `shouldResetToday` on every load and zeroes `used_credits` + bumps `last_reset_at` on UTC date rollover. Reset is purely client-driven for now (matches the existing frontend-owned DB pattern).
- Deduction happens in `Dashboard.jsx::handleSubmit` AFTER `createProcessingJob` returns a `record_id`. Backend is not aware of credits — entirely frontend-driven, same pattern as `saveTranscript`. Deduction is idempotent: `deductCreditsForJob` rejects a second call against the same `record_id` because `transcripts.credits_used` is already > 0.
- Refund: when a job's status flips to `failed`, `ProcessingJobsProvider` calls `refund({ recordId })`. Idempotent via `transcripts.credits_refunded` column AND an in-memory `refundProcessed` flag on the job state. Old records (pre-feature) have `credits_used = 0` so refund is a no-op.
- UI:
  - `Navbar` shows `CreditsBadge`: pill with `Remaining: X/Total` (amber when below threshold) plus `Used today: Y` (hidden on small screens).
  - `AudioUploader` shows `Credits required: X` after the audio metadata loads. Red "Insufficient credits remaining." banner + disabled submit when required > remaining. Amber "low after this job" advisory when remaining drops to/under threshold post-deduction.
  - `Dashboard.handleSubmit` short-circuits with the same insufficient message before calling the backend.
- Backend: zero changes. AssemblyAI/Groq fallback pipeline, jobs route, history reads, compare/merge endpoints are all untouched.
- RLS on `user_credits` is intentionally disabled (matches existing `transcripts` table). Hardening note: with the anon key in the browser any authenticated user could write to any row. For production, gate writes through Supabase RPC + RLS policies — added to the pending list below.
- Frontend build (`npm.cmd run build`) passes with all credit patches applied.

### Credits initialization hardening
- `frontend/src/services/credits.js` was rewritten to use a true `supabase.upsert(payload, { onConflict: "user_id", ignoreDuplicates: true })` for row creation. This replaces the older select-then-insert pattern that race-condition-failed across tabs and silently left the user at 0 credits.
- New exported helpers: `ensureUserCreditsRow(userId)` and `defaultCreditsRecord(userId)`. The ensure helper is called at the top of `fetchOrCreateUserCredits`, `deductCreditsForJob`, and `refundCreditsForJob`, so any code path that touches credits will create the row first if it is missing.
- `fetchOrCreateUserCredits` no longer throws on DB failures (missing table, RLS misconfiguration, network blip). Falls back to `defaultCreditsRecord(userId)` so the UI never shows "0 remaining" merely because the row could not be created. Real `used_credits === total_credits` is unaffected — that genuinely shows 0.
- `deductCreditsForJob` and `refundCreditsForJob` fail-open when the row is unreachable: they log to console and return `{ skipped: true, reason }` / `null` instead of blocking the user. Trade-off chosen so the app stays usable even before `supabase_credits_migration.sql` has been run.
- Race-condition duplicate-key errors (Postgres code 23505) from the upsert are swallowed silently — they mean another concurrent insert won. Any other upsert error is logged.

### Credit deduction persistence hardening
- `deductCreditsForJob` no longer throws when the `transcripts.credits_used` guard read errors (e.g. column missing because migration only ran partially). It logs a `console.warn` and proceeds. The `user_credits.used_credits` update is the source of truth; the transcript stamp is best-effort audit/cross-session dedup.
- `refundCreditsForJob` accepts a `fallbackAmount` argument so refunds still work when `transcripts.credits_used` is unreadable.
- `CreditsContext` now keeps a `useRef(new Map())` keyed by `jobId` → `{ amount, recordId }`. Deduct adds entries; refund looks up the fallback amount; both delete-on-success. Session-level dedup prevents double-deduction within a single tab even if the DB stamp fails.
- `Dashboard.handleSubmit` passes `{ jobId, recordId, amount }` to `deduct` and surfaces any deduction error to the UI banner (no longer silent `console.error`).
- `ProcessingJobsContext` refund call passes `{ jobId, recordId }` for fallback lookup. Refund no longer requires `record_id` to be truthy.

### RLS + Noisy-audio behaviour
- New migration file `docs/supabase_credits_rls.sql` enables RLS on `user_credits` with three policies scoped to `auth.uid() = user_id`: SELECT, INSERT, UPDATE for `authenticated` role only. Replaces the earlier "DISABLE RLS" stance. Must be run AFTER `supabase_credits_migration.sql` in the Supabase SQL editor.
- Quality assessment in `backend/services/groq_service.py::assess_transcription_quality` no longer classifies low-quality speech as `noisy_unsupported`. Replaced with three types: `empty_audio` (no meaningful text — blocked), `music_song` (lyrics-heavy with no real conversation — blocked), `noisy_speech` (low score / quality flags but real speech — supported, warned).
- `is_supported` now returns `False` only for `music_song` and `empty_audio`. Noisy meetings, phone calls, WhatsApp recordings, and low-fidelity audio all transcribe normally and just get an inline amber warning.

### Summary fallback + UX warning
- `process_audio_file` wraps `summarise_transcript` in try/except. Summary failure (Groq 429, network blip) no longer fails the job. Transcript, segments, speakers all persist; summary becomes "Summary unavailable right now. Transcript was saved successfully." appended to `warning`.
- `Dashboard.jsx` only renders the heavy `UnsupportedAudioNotice` for `audio_type === "music_song" || audio_type === "empty_audio"`. For everything else (noisy_speech with warning, summary skipped, etc.) it renders a small amber inline banner above the normal transcript/summary UI and continues to render the full result.

### Groq Llama model fallback (TPD resilience)
- `backend/services/groq_service.py` introduces `_PRIMARY_MODEL = "llama-3.3-70b-versatile"` and `_FALLBACK_MODEL = "llama-3.1-8b-instant"` constants plus a `_llama_complete(messages, temperature)` helper.
- All Llama call sites — `summarise_transcript`, `infer_speakers`, `_infer_segment_speakers`, `chat_with_audio`, `_run_analysis_prompt` — go through `_llama_complete`. On any 429 / rate-limit / "tokens per day" error from the primary, it transparently retries with the 8B-instant model (separate quota, smaller context, faster).
- Caller code unchanged. Summaries / chat / compare / merge / speaker inference all keep working when the 70B daily cap is exhausted; quality is slightly lower until the daily reset.

### Usage page + analytics scaffold
- New `/usage` route and `frontend/src/pages/UsagePage.jsx` show the user their credits, lifetime activity, and recent transcripts. Linked from `Navbar` next to History.
- New service `frontend/src/services/analytics.js` with `getUserAnalytics(userId)` (aggregates the user's own `transcripts` rows: totalJobs, completedJobs, failedJobs, totalMinutes, totalCreditsSpent, recent[5]) and a stub `getAdminAnalytics()` placeholder for a future admin page (will require a server-side RPC behind an admin role — RLS would otherwise block).
- New helper components: `UsageStatCard.jsx` (label/value tile with tone variants), `UsageProgressBar.jsx` (percentage bar that turns amber at 80% and red at 100%).

### Customer-friendly UX pass
- New `frontend/src/utils/errorMessage.js::friendlyError(raw)` maps technical error strings (429 / rate limit / tokens-per-day / fetch failed / unsupported file type / too large / processing failed) to short user-facing messages. Strips JSON payloads and "Error code: NNN" boilerplate. Used by `Dashboard`, `HistoryPage`, and `ProcessingJobsContext` so users never see raw API/stack content.
- New `frontend/src/components/Tooltip.jsx` (CSS-only hover tooltip) and exported `HelpIcon` component. Used on `CustomizationPanel` Summary Focus dropdown (shows per-option help), `SpeakerModeToggle` (explains the toggle), `CreditsBadge` (explains credit math), and the History `Compare` / `Merge` buttons.
- New `frontend/src/components/ProcessingStages.jsx` replaces the old single-line "Processing audio" status. Four-step indicator: Uploading audio → Transcribing → Generating summary → Finalizing. Derived from `{ starting, status, hasResult }` + an internal `setInterval` so the visible active step advances past Transcribing after ~20 s of `processing` state (the backend doesn't expose substages).
- New `frontend/src/components/UploadTips.jsx` shown below the dropzone before file selection: "Great for" pills (Meetings / Interviews / Phone calls / WhatsApp recordings / Lectures / Podcasts), supported formats, and four short tip lines.
- `HistoryPage` empty state replaced with a friendly bordered card + "Upload Audio" CTA linking to `/dashboard`.

### Transcript delete (single + bulk)
- New `frontend/src/components/ConfirmModal.jsx` — reusable, backdrop-click cancels, ARIA `role="dialog"`. Replaces `window.confirm` everywhere we delete.
- New `frontend/src/services/supabase.js::deleteTranscripts(recordIds)` — single round-trip bulk delete via `.delete().in("id", recordIds)`.
- `HistoryItem.jsx` shows the Delete button on **both** completed and failed cards (not just failed). Uses `ConfirmModal` for the prompt.
- `HistoryPage.jsx`:
  - Every record card is selectable (the old completed-only `selectable` restriction was removed). Compare/Merge still filter to completed records via `completedRecords`, so they keep working correctly.
  - Toolbar is now visible whenever `records.length > 0` (not just when there are 2+ completed records or something selected).
  - New "Select all" / "Deselect all" toggle.
  - New red `Delete (N)` bulk button — appears whenever any rows are selected, visually separated from Compare/Merge by a thin vertical divider. Confirms via `ConfirmModal` then calls `deleteTranscripts(selectedIds)`, optimistically prunes local state, and clears the selection.

### Analytics + API monitoring persistence
- Root issue: Analytics + API Monitoring admin pages always showed zero data because everything was derived live from `transcripts` rows. Provider/duration columns were optional and silently missing, and no separate record existed for external API calls. Fix introduces a dedicated event-sourced persistence layer.
- **NEW** migration `docs/supabase_analytics_events_migration.sql`. Creates two tables with RLS DISABLED (matches existing pattern) and indexes on `created_at` / `provider` / `user_id` / `transcript_id`:
  ```sql
  CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID, job_id TEXT, user_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    duration_seconds NUMERIC DEFAULT 0,
    language TEXT, audio_type TEXT, provider_used TEXT,
    credits_used INTEGER DEFAULT 0, processing_ms INTEGER,
    transcript_status TEXT, error_message TEXT
  );
  CREATE TABLE IF NOT EXISTS api_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL, endpoint TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN DEFAULT TRUE, rate_limited BOOLEAN DEFAULT FALSE,
    duration_seconds NUMERIC DEFAULT 0, latency_ms INTEGER, error_message TEXT
  );
  ```
- **NEW** `backend/services/analytics_service.py`. Uses `SUPABASE_SERVICE_ROLE_KEY` when set, falls back to anon key with a startup warning so RLS-protected tables still work in dev.
  - `record_transcript_event(transcript_id, job_id, user_id, duration_seconds, language, audio_type, provider_used, credits_used, processing_ms, transcript_status, error_message)` — inserts into `analytics_events`. Raises on failure so the caller can decide; the call site in `routes/jobs.py` wraps it so analytics failure never masks a successful transcript.
  - `record_api_call(provider, endpoint, success, rate_limited, duration_seconds, latency_ms, error_message)` — inserts into `api_usage_events`. **Never raises** but logs loudly. External AI call paths cannot fail because of monitoring instrumentation.
  - `backfill_from_transcripts(force=False)` — copies every existing `transcripts` row into `analytics_events` in chunks of 200. Dedupes by `transcript_id` so re-running is safe. Use via `POST /admin/analytics/backfill {"force": true}`.
  - Helper `_count_rows(table)` uses Supabase `count="exact"` for row-count reporting in logs and the diagnostic endpoint.
  - Hard logs: `[Analytics] begin tracking ...`, `[Analytics] inserted id=... total_rows_now=N`, `[Analytics] insert failed: ...`, `[Monitoring] updated provider=... endpoint=...`.
- **EDIT** `backend/routes/jobs.py`. Imports `record_transcript_event`; stores `user_id` on the in-memory JOBS dict at create time. Rewrote `_run_job` to call new helper `_emit_transcript_event` on **both** success and failure. The helper reads `credits_used` back from the `transcripts` row (so refunds aren't double-counted) and passes it through.
- **EDIT** `backend/services/assemblyai_service.py`. Wraps `transcribe_audio` with `time.perf_counter()` timing + `record_api_call(provider="assemblyai", endpoint="transcribe", ...)` on success, SDK-raised failure, and error-status response paths. New helper `_is_rate_limited(err)` checks for `429` / `rate limit` / `quota` strings.
- **EDIT** `backend/services/groq_service.py`. Rewrote `_llama_complete` so the primary model attempt and the 8B-instant fallback path each record their own `api_usage_events` row with separate endpoint labels. Wrapped `transcribe_audio` (Groq Whisper fallback) with the same timing + record pattern.
- **EDIT** `backend/services/admin_service.py`.
  - `get_analytics()` now reads from `analytics_events` first (14-day daily buckets, languages / audio_types / providers distributions). Falls back to scanning `transcripts` only when `analytics_events` is missing or empty.
  - `get_api_monitoring()` now reads from `api_usage_events` first (24h window, aggregating by provider). The Groq Llama + Groq Whisper rows are grouped under a single "groq" provider in the response. Falls back to deriving from `transcripts` if `api_usage_events` is missing.
  - Both functions were refactored into `_get_analytics_inner` / `_get_api_monitoring_inner` helpers with an outer try/except that prints + `logger.exception` and returns a safe empty dict. This restores the wrap the original code had — any internal failure (malformed `created_at`, edge case in `_safe_parse`, etc.) now returns `{}` instead of bubbling a 500 to FastAPI.
  - New `get_diagnostics()` reports env config and table health: `env.service_role_key_set`, `env.supabase_url`; per-table `{exists, row_count, error, latest_created_at}` for `transcripts`, `analytics_events`, `api_usage_events`, `user_credits`, `admin_users`; `recent_transcripts` and `recent_analytics_events` (last 5 rows each). Each query is individually try/except wrapped using `count="exact"`.
- **EDIT** `backend/routes/admin.py`. Added `from services import analytics_service`. New routes:
  - `POST /admin/analytics/backfill` — accepts `{"force": true}` body, calls `analytics_service.backfill_from_transcripts(force=force)`, returns 500 on raised error so the operator sees the underlying DB problem rather than a silent no-op.
  - `GET /admin/diag` — calls `admin_service.get_diagnostics()`. One-shot endpoint for diagnosing why the analytics/monitoring pages render empty (missing migration, missing env var, no rows, etc.).

### Backend CORS hardening
- Admin pages on the Vercel frontend were blocked with `No 'Access-Control-Allow-Origin' header`. Root cause: backend was using `allow_origins=["*"]` with `allow_credentials=False`, and the admin endpoints rely on `Authorization` headers + credentials.
- **EDIT** `backend/main.py`. Replaced the wildcard CORS block with an explicit allowlist that merges in `ALLOWED_ORIGINS` env values:
  ```python
  _base_origins = [
      "https://audio-transcriber-summariser.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
  ]
  _env_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
  _allowed_origins = list(dict.fromkeys(_base_origins + _env_origins))
  print(f"[CORS] allowed origins: {', '.join(_allowed_origins)}")
  app.add_middleware(
      CORSMiddleware,
      allow_origins=_allowed_origins,
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
- `allow_credentials=True` requires explicit origins (FastAPI/Starlette ignores wildcard once credentials are on). The `ALLOWED_ORIGINS` env var is now additive — extra origins (preview deploys, custom domains) can be appended without redeploying the backend code.
- Startup log `[CORS] allowed origins: ...` is emitted once on boot so the Render log shows the live allowlist after every deploy.

### Pending verification (analytics/monitoring)
1. Run `docs/supabase_analytics_events_migration.sql` in Supabase SQL editor (creates `analytics_events` + `api_usage_events`).
2. Set `SUPABASE_SERVICE_ROLE_KEY` on the Render dashboard for the backend service. Without it `analytics_service` falls back to the anon key and the warning `[Analytics] SUPABASE_SERVICE_ROLE_KEY not set; falling back to anon key — RLS may block inserts` will appear in logs.
3. Redeploy backend on Render after both the migration and env var are in place.
4. Hit `GET /admin/diag` with the admin JWT to confirm:
   - `env.service_role_key_set` is `true`
   - `tables.analytics_events.exists` is `true`
   - `tables.api_usage_events.exists` is `true`
   - `tables.transcripts.row_count` matches expectation
5. Upload one new audio job; `recent_analytics_events` in `/admin/diag` should grow by one and the API Monitoring page should show at least one Groq + one AssemblyAI row in the 24h window.
6. If `analytics_events` is empty but `transcripts.row_count > 0`, call `POST /admin/analytics/backfill {"force": true}` once to populate historical analytics from existing transcripts.

### Analytics + monitoring zero-data robustness pass
- Symptom after the persistence layer shipped: Analytics page rendered "No data yet" and API Monitoring showed all zeros + subtitle "Last 24 hours, derived from transcript status" + footer "Note: stats are inferred from `transcripts` rows." That subtitle/footer is the **fallback wording** in `_get_api_monitoring_inner` — so the primary read from `api_usage_events` was failing (table missing / RLS blocking / not yet migrated) and the secondary fallback from `transcripts` was also returning zero because the queries were column-fragile.
- Three root causes all needed to be tolerated simultaneously: (1) `docs/supabase_analytics_events_migration.sql` not yet run → tables don't exist, (2) `SUPABASE_SERVICE_ROLE_KEY` not set on Render → anon-key insert blocked by default permissions, (3) `transcripts` rows missing optional columns like `transcription_provider` that the fallback assumed were present.
- **EDIT** `backend/services/admin_service.py`.
  - `_get_api_monitoring_inner` fallback rewritten to read only columns that always exist on `transcripts`: `id, status, error_category, error_message, created_at, duration_seconds`. Null/missing `status` is treated as "completed" so historical rows (pre-status-column) still count. Groq request count = successful summary rows; AssemblyAI request count = rows with non-null transcript text; failures bucketed via `status == "failed"`; processed minutes = `sum(duration_seconds)/60`. The fallback no longer references `transcription_provider` at all, so the response populates whether or not the credits migration column-set is present.
  - `_get_analytics_inner` now **auto-backfills on read**: when `analytics_events.row_count == 0` AND `transcripts.row_count > 0`, calls `analytics_service.backfill_from_transcripts(force=False)` inline and re-queries `analytics_events`. First admin page load after the user runs the migration auto-populates the charts; no need for them to remember to `POST /admin/analytics/backfill` manually.
  - Both endpoints now return a `source` field in the response: `"analytics_events"` / `"api_usage_events"` / `"transcripts_fallback"` / `"empty"`. Lets curl-based diagnosis say definitively which path served the response without parsing wording.
  - Outer try/except wrap on both `_get_*_inner` helpers preserved so any internal failure still returns a safe empty dict instead of a 500.
- **EDIT** `backend/services/analytics_service.py`.
  - New module-level `_classify_insert_error(exc)` inspects PostgREST error codes/messages and emits one loud log per process for known-bad states:
    - `42P01` (relation does not exist) → `[Analytics] table missing — run docs/supabase_analytics_events_migration.sql in Supabase SQL editor`
    - `42501` (insufficient_privilege) → `[Analytics] insert denied — SUPABASE_SERVICE_ROLE_KEY likely missing or RLS blocks anon role`
  - Wired into all three insert sites: `record_transcript_event`, `record_api_call`, and the per-chunk insert inside `backfill_from_transcripts`. Module-level guard so the same diagnostic doesn't spam every call — it logs once then quietly continues to fail-soft like before.
- Frontend untouched. Job pipeline, transcription services, jobs route, credits, history, CORS config untouched.

### Pending verification (analytics zero-data fix)
1. Run `docs/supabase_analytics_events_migration.sql` in Supabase SQL editor. Creates `analytics_events` + `api_usage_events` tables with RLS DISABLED.
2. Set `SUPABASE_SERVICE_ROLE_KEY` on the Render dashboard for the backend service. Pull the value from Supabase → Settings → API → `service_role` JWT. Without it the new diagnostic log `[Analytics] insert denied — SUPABASE_SERVICE_ROLE_KEY likely missing or RLS blocks anon role` will appear on the first transcription after deploy.
3. Push backend → Render redeploys.
4. Hit `/admin/analytics` once (just opening the admin page is enough). Backend will auto-backfill historical transcripts into `analytics_events` on that first read. Charts should populate immediately.
5. Run a fresh transcription. Confirm Render logs print `[Analytics] inserted id=... total_rows_now=N` and `[Monitoring] updated provider=...`.
6. To diagnose later, curl: `curl -H "Authorization: Bearer <JWT>" https://audio-transcriber-summariser.onrender.com/admin/analytics | python -m json.tool`. The `source` field tells you the served path: `analytics_events` (healthy), `transcripts_fallback` (migration not yet run, but UI still shows real numbers), `empty` (no transcripts at all).
7. Same curl with `/admin/api-monitoring` for the API monitoring tab. Want `source == "api_usage_events"` post-migration.

### Telegram Bot Integration (V1)
- Goal: turn the existing web-app pipeline into a Telegram AI assistant. Users open the bot, send voice / audio / call / meeting recording, get back transcript + summary + key points + inline action buttons. **No frontend / admin / credits changes.**
- **NEW** `backend/services/telegram_service.py` — bot client built on `httpx` (no `aiogram` / `python-telegram-bot`); lazy token check (boots without `TELEGRAM_BOT_TOKEN`, only `/telegram/webhook` fails closed), `download_file(file_id)`, `send_message`, `edit_message_text`, `answer_callback_query`, `send_chat_action`, `send_document`, `set_webhook`, helpers `format_result_reply`, `format_duration`, `welcome_text`, `is_email`, `_html_escape`.
- **NEW** `backend/routes/telegram.py` registers `POST /telegram/webhook` (always returns 200 so Telegram doesn't retry-storm) and `GET /telegram/set-webhook?url=...`. Handles `voice`, `audio`, `video_note`, `document` (audio mime). Reuses `process_audio_file` from `routes/process.py` — no duplicated pipeline.
- Persistence: synthetic per-chat `user_id = uuid5(NAMESPACE_DNS, "telegram:<chat_id>")` so every chat maps to a stable bucket in the existing `transcripts` table. Rows are filed under audio_name `voice_<message_id>.ogg` / `audio_*` etc.
- Analytics tag `provider_used = "telegram+<assemblyai|groq_whisper>"` — admin Analytics page surfaces the Telegram channel without any schema change.
- Buttons (V1): `[PDF]` `[Email me]` `[Translate]` `[Ask Questions]`. Callback scheme `pdf:<id>`, `email:<id>`, `translate:<id>`, `ask:<id>`.
- PDF generation server-side via `reportlab` (jsPDF is frontend-only). Each PDF render is independent — no disk cache (Render free has ephemeral FS).
- Email via SMTP initially (Gmail STARTTLS / SSL configurable). Per-chat in-memory `_AWAITING_EMAIL[chat_id] = record_id`; next plain-text from same chat is captured as the destination address. Optional vars; falls through to "Email not configured" without them.
- Ask Mode via in-memory `_ASK_MODE[chat_id] = record_id`; routes the next text message to existing `chat_with_audio`. Single-turn for now (no message history).
- File-ext normalisation: Telegram-native `.ogg` voice notes and `.mp4` / `.webm` video notes are renamed to `.m4a` for `process_audio_file`'s extension gate — providers sniff content, suffix is cosmetic.
- New deps: `httpx==0.27.2`, `reportlab==4.2.5`. New env: `TELEGRAM_BOT_TOKEN` (required). Optional SMTP: `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` `SMTP_USE_SSL`.
- Manual one-time: register webhook via `GET https://.../telegram/set-webhook?url=https://.../telegram/webhook`. Browser GET shows `{ok: true, telegram_response: {...}}`. Hitting `/telegram/webhook` directly in a browser shows `Method Not Allowed` — this is correct (endpoint is POST-only).

### Render SMTP block → switch to Resend HTTP API
- Symptom: `[Telegram] SMTP send failed` traceback in Render logs ending `OSError: [Errno 101] Network is unreachable` on `socket.create_connection` to `smtp.gmail.com:587`.
- Root cause: Render free tier blocks outbound TCP on SMTP ports 25 / 465 / 587. Gmail SMTP can never succeed from a Render service.
- Fix: `_send_summary_email` now prefers `RESEND_API_KEY` over SMTP. New helper `_send_via_resend(to_addr, subject, body, api_key)` POSTs to `https://api.resend.com/emails` with the existing `httpx` async client. SMTP path is kept as a fallback for dev / non-Render hosts that aren't blocked.
- `_email_configured()` returns true when EITHER `RESEND_API_KEY + EMAIL_FROM` are set OR the full SMTP quintet is set. `_smtp_configured()` is a backward-compat alias.
- New env (recommended): `RESEND_API_KEY`, `EMAIL_FROM`. Without a verified Resend domain, `EMAIL_FROM=onboarding@resend.dev` only delivers to the Resend account owner's signup email — verify a domain to send anywhere.
- Vercel app domains (`*.vercel.app`) cannot be used as Resend senders — Vercel owns the DNS; you can't add SPF/DKIM records there.

### Custom exit command (`/exit`)
- Added `/exit` (also `/cancel`, `/stop`) to leave ask-mode / email-collection mode. Previously the only escape was `/start`, which also re-printed the welcome screen.
- Updated ask-mode entry prompt to reference `/exit` instead of `/start`.

### V3 AI Actions + Productivity Layer
- Goal: move from `Audio → Transcript → Summary` to `Audio → Transcript → Summary → Detect Tasks → Suggest Actions`. A second LLM pass extracts structured `{tasks, people, dates, deadlines, events}`, persists into a new `action_items` table, and surfaces in the Telegram reply.
- **NEW** `backend/services/actions_service.py`:
  - `extract_actions(transcript, summary, language)` — strict-JSON Groq Llama pass via `_llama_complete` (so 70B → 8B fallback applies). System prompt forbids markdown / prose. `_safe_parse_json` and `_normalise_extraction` produce the canonical 5-key dict even on LLM / parse failure (returns empty lists, never raises).
  - `save_action_items(user_id, transcript_id, extracted)` → bulk insert, returns inserted IDs.
  - `list_action_items(user_id, status, limit)`, `list_action_items_for_transcript(transcript_id)`.
  - `mark_action_done(id)`, `mark_action_dismissed(id)`, `mark_transcript_actions_status(transcript_id, new_status)` for bulk ops from the Done / Dismiss buttons.
  - `mark_urgent_for_transcript(transcript_id, transcript_text)` — scans saved action_items + transcript text for urgency keywords (today, tomorrow, urgent, asap, deadline, eod, right now, immediately) and flips matching rows to `priority='urgent'`. If the transcript itself contains an urgency keyword, ALL pending items for that transcript are flagged.
  - Fail-soft: `_warn_table_missing(exc)` emits a one-time loud log on `42P01` (table missing → run migration) or `42501` (RLS / role denied → set `SUPABASE_SERVICE_ROLE_KEY`) then quietly fails-soft.
- **NEW** `backend/services/reminder_service.py` — scaffold only. Stubs `schedule_reminder`, `cancel_reminder`, `due_reminders`, `notify_due`. Module docstring outlines the planned `/cron/reminders` HTTP-cron entry point. Not wired into the request flow yet.
- **NEW** `docs/supabase_action_items_migration.sql` — `action_items` table with `id, user_id, transcript_id (FK ON DELETE CASCADE), title, description, person, due_date, due_time, status DEFAULT 'pending', priority DEFAULT 'normal', created_at`; indexes `(user_id, status)` and `(transcript_id)`. RLS DISABLED (matches house style).
- **EXTEND** `backend/routes/telegram.py`:
  - After `process_audio_file` returns, runs `actions_service.extract_actions(...)` and `save_action_items(...)` then `mark_urgent_for_transcript(...)`. Each step is independently try/except wrapped — extraction failure never kills the summary reply.
  - New reply via `telegram_service.format_actions_reply(result, extracted)` — same Summary section, then **Action Items** (urgent ones rendered with `🔴` prefix via `_is_urgent_text`), then **Detected People / Dates / Deadlines / Events** sections (only rendered when they have content).
  - New button rows via `result_action_buttons_with_actions(record_id)`:
    - Row 1: `[✅ Done]` `[📅 Calendar]`
    - Row 2: `[📧 Email]` `[🌐 Translate]`
    - Row 3: `[💬 Ask]` `[❌ Dismiss]`
    - Callback scheme adds `cal:<id>`, `action:done:<id>`, `action:dismiss:<id>` alongside existing `pdf | email | translate | ask`.
  - `cal:<id>` builds an `.ics` via `telegram_service.build_ics` (RFC 5545, stdlib only — no `icalendar` dep) containing one VEVENT per task with a `due_date`. Sent via `send_document`. If no dated tasks → friendly "No dated tasks to add to calendar." reply.
  - `action:done` and `action:dismiss` call `mark_transcript_actions_status(record_id, new_status)`; reply with `✅ All tasks marked done.` / `❌ Tasks dismissed.` footer.
  - New text commands: `/tasks` and `/pending` and `/completed` → numbered task list (max 25) via `_send_action_list`; `/help` → command index.
- `telegram_service` additions: `format_actions_reply`, `result_action_buttons_with_actions`, `build_ics`, `help_text`, `_is_urgent_text`, urgent-keyword tuple.

### V4 Daily Intelligence / AI Secretary
- Goal: turn the bot into an AI secretary. Auto-extracts recurring themes + important people + productivity score across a rolling 7-day window. Ships a daily HTML digest in user-local timezone via HTTP cron.
- **NEW** `backend/services/productivity_service.py` — pure helpers, no LLM:
  - `compute_score(user_id, since, until)` reads `transcripts` + `action_items`; returns `{recordings, work_recordings, total_seconds, tasks_total, tasks_done, tasks_pending, tasks_dismissed, completion_pct, score, insufficient_data}`. Score formula `0.6 * completion_pct + 0.4 * min(100, work_recordings * 12)`. `work_recordings` excludes `audio_type IN ('music_song', 'empty_audio')`.
  - `insufficient_data == True` when `tasks_total == 0 AND work_recordings == 0`; in that state `score` and `completion_pct` are `None` (renderers show "Not enough work-related data yet" instead of "0 / 100").
  - `format_duration(seconds)` → `"2h 14m"` / `"42m"` / `"18s"`.
  - Fail-soft: every DB error returns the zero-shape so the digest still ships.
- **NEW** `backend/services/topic_analysis_service.py`:
  - `extract_topics(transcripts, top_k)` — single Llama pass over concatenated summaries (each truncated to 400 chars, total prompt capped near 6000 chars). Strict JSON returning `{topics: [{label, mentions}], people: [{name, mentions}]}`. Defensive parse.
  - `refresh_topic_window(user_id, days=7)` reads last-N-day transcripts, calls `extract_topics`, REPLACES the user's rows in `topic_stats` + `people_stats` for the current `(window_start, window_end=today)` window.
  - `recurring_themes(user_id, days=7, min_mentions=3)` reads cached topic_stats; `latest_people(user_id, limit=8)` reads people_stats.
- **NEW** `backend/services/digest_service.py` — orchestrator:
  - `build_today_digest(user_id, chat_id, tz_name="UTC")` returns `{summary_text: "<HTML>", metadata: {date, recordings (count), recordings_list: [{id, audio_name, duration_seconds}], total_seconds, topics, people, pending_tasks, deadlines, languages, productivity}}`.
  - Day window = midnight-to-now in user's TZ via `zoneinfo.ZoneInfo(tz_name)`; falls back to UTC on invalid TZ.
  - Pending tasks sorted urgent-first then by recency. Deadlines = pending tasks with `due_date >= today_local`.
  - `_render_digest_html(...)` builds HTML safely escaped. Productivity block honors `insufficient_data`. Recording filenames are NO LONGER bulleted in the body — they're delivered as interactive cards (see V4.2 below).
  - `save_digest`, `get_cached_digest(user_id, today)` — upsert / read `daily_digest` keyed `(user_id, digest_date)`.
  - `should_send_now(prefs_row, now_utc)` — true when, in user's TZ, current minute is within ±7 of `(digest_hour:digest_minute)` AND `last_digest_sent_at` is not today (in user's local date).
  - `parse_digest_time(raw)` handles `8pm`, `8:30pm`, `20:00`, compact `2000` / `0830`, bare hour `20`. `format_digest_time(hour, minute)` renders `"8:00 PM"`.
  - Telegram-chat-prefs helpers: `upsert_chat_prefs`, `get_chat_prefs`, `set_timezone`, `set_digest_enabled`, `set_digest_time`, `mark_digest_sent`, `list_enabled_prefs`. All fail-soft with one-time warning log on table-missing.
- **NEW** `backend/routes/cron.py` — `POST /cron/digest` guarded by `X-Cron-Secret` header against `CRON_SECRET` env var (returns 503 if env missing, 401 if header mismatch). Iterates `telegram_chat_prefs.digest_enabled = true`; for each chat that passes `should_send_now`: builds digest → saves to `daily_digest` → `send_message(summary_text)` → sends interactive recording cards → `mark_digest_sent`. Per-row try / except; returns `{ok, sent, skipped, errors}`.
- **NEW** `docs/supabase_v4_intelligence_migration.sql` — creates `telegram_chat_prefs (chat_id PK, user_id, timezone, digest_enabled, digest_hour, last_digest_sent_at, created_at, updated_at)`, `daily_digest (id, user_id, digest_date, summary, metadata JSONB, UNIQUE(user_id, digest_date))`, `topic_stats`, `people_stats`. Adds `priority TEXT DEFAULT 'normal'` to `action_items`. RLS DISABLED on all four.
- **NEW** `docs/supabase_v4_digest_minute_migration.sql` — V4.1: adds `digest_minute SMALLINT DEFAULT 0` to `telegram_chat_prefs`.
- **EXTEND** `backend/routes/telegram.py`:
  - First-touch hook in `_dispatch_update`: best-effort `digest_service.upsert_chat_prefs(chat_id, _chat_user_id(chat_id))` on every incoming message.
  - New text commands: `/digest`, `/stats`, `/topics`, `/people`, `/timezone <TZ>`, `/digest_on [time]`, `/digest_off`, `/digest_time <time>`, `/help` (extended).
  - `/digest` reuses today's cached digest if present, otherwise builds live + caches. Sends summary message, then per-recording interactive cards.
  - `/stats` shows productivity + recordings + audio duration + the user's current daily-digest setting line.
  - `/topics` calls `refresh_topic_window` then `recurring_themes` (8 max) for the user.
  - `/people` same pattern with `latest_people` (8 max).
  - `/timezone Asia/Kolkata` validates via `ZoneInfo` and persists; `/timezone` alone shows current.
  - `/digest_on 20:00`, `/digest_on 8pm`, `/digest_on 8:30pm` — `parse_digest_time` handles all forms. Reply: `Daily digest enabled for 8:00 PM Asia/Kolkata`.
  - `/digest_time 21:15` — same parser, sets time without toggling enable state.
  - `/digest_off` — flips `digest_enabled = false`.
- New env: `CRON_SECRET` (required for cron endpoint). cron-job.org config: method POST, header `X-Cron-Secret: <secret>`, schedule every 15 min.

### V4.2 — Interactive digest cards + smarter productivity
- After today's digest summary message, the bot now sends one `audio-name` card per recording with inline buttons `[Summary] [Transcript] [PDF]`. Lets users revisit old recordings without scrolling chat history.
- New callbacks: `dsum:<id>` (stored summary, no LLM call), `dtx:<id>:<page>` (transcript paginated at 3500 chars / page with `Prev` / `Next` — uses `edit_message_text` so the same message updates rather than spawning new ones), `dpdf:<id>` (reuses `_action_pdf` — generated from DB, no transcription / no LLM).
- Each callback calls `_fetch_record_by_id` against `transcripts`; "no longer available" / "no summary stored" friendly fallbacks if a row is missing or empty.
- Cron digest run (`/cron/digest`) also emits the per-recording cards by importing `_send_digest_recording_cards` lazily from `routes.telegram` and reading `metadata.recordings_list`.
- `_send_digest_recording_cards` and `_action_digest_*` helpers live in `routes/telegram.py`.
- Productivity logic in `productivity_service.compute_score` now flags `insufficient_data` (see service block above). `/stats` and `_render_digest_html` render `Productivity: Not enough work-related data yet` when true; otherwise show the real score + completion %. Eliminates the previous misleading `29 / 100 — 0 done, 0 pending (0 % completion)` output for music-only / casual chat / first-time users.
- `digest_service.metadata.recordings_list` is the new contract; downstream consumers (Telegram cards, cron) read from it. `_render_digest_html` no longer bullet-lists filenames in the body (cards do that visually).

### Hyperframes promo videos
- Two compositions scaffolded under `video/`:
  - `video/my-video/` — 26.5s explainer covering the web flow only (Hook → Drop → AI → Results → Extras → CTA).
  - `video/app-and-bot-v1/` — 38s 9-scene explainer covering BOTH the web app AND the Telegram bot (Hook → Two Channels → Web Drop → Web Results → Telegram Send → Telegram Reply → Commands → Daily Digest → CTA).
- Shared palette: dark `#0e1014` canvas, amber accent `#f5a64a`, sage secondary `#7ea88c`, warm-off-white fg `#f4ede0`. Display font Bricolage Grotesque (800 vs italic-300), mono register JetBrains Mono. 1920x1080.
- Both projects pass `hyperframes lint` with 0 errors and `hyperframes inspect` clean. Remaining `validate` contrast warnings are sampler false positives on dark-text-inside-amber-chips (CTA URL card, active tab, active stage check) — verified visually.
- Render command: `cd video\app-and-bot-v1; npm run render` (PowerShell — no `&&`).

### Pending verification (V3 / V4 deploy)
1. Run `docs/supabase_action_items_migration.sql` (V3 action_items table).
2. Run `docs/supabase_v4_intelligence_migration.sql` (V4 telegram_chat_prefs, daily_digest, topic_stats, people_stats; adds `priority` to action_items).
3. Run `docs/supabase_v4_digest_minute_migration.sql` (V4.1 digest_minute column).
4. Render env: set `CRON_SECRET` (any 32+ char random string). Optional: `RESEND_API_KEY`, `EMAIL_FROM` for the email button.
5. Deploy backend.
6. cron-job.org → new job, POST `https://audio-transcriber-summariser.onrender.com/cron/digest`, header `X-Cron-Secret: <secret>`, schedule every 15 min.
7. Telegram smoke test: `/start` → `/timezone Asia/Kolkata` → `/digest_on 8pm` → send a multi-speaker meeting clip → confirm reply has Action Items + Detected sections + 6 buttons + urgent badge on time-sensitive items → `/tasks` lists them → tap Calendar → `.ics` arrives → `/digest` after a few clips → expect summary + per-recording cards each with `[Summary][Transcript][PDF]` → tap Transcript → page through with Next.

### Gotchas added this session
- Render free tier blocks outbound SMTP (25 / 465 / 587). Always prefer HTTP email providers (Resend / SendGrid / Postmark) on Render.
- `*.vercel.app` and other shared subdomains can't be Resend senders — domain ownership is required for SPF / DKIM. Use Resend sandbox `onboarding@resend.dev` for personal-account testing, or buy a cheap domain for production.
- `/telegram/set-webhook?url=...` is GET (browser-friendly); `/telegram/webhook` is POST-only (returns `Method Not Allowed` if opened in a browser — this is correct, not a bug).
- Telegram bot uploads are capped at **20 MB** by the Bot API, not the 25 MB the web app accepts. Larger clips should be told to use the web app.
- The `dtx:<id>:<page>` callback is parsed specially in `_handle_callback` because it has 3 colon-separated parts; all other callbacks are 2-part `prefix:record_id`.
- `_ASK_MODE` and `_AWAITING_EMAIL` are process-local dicts. A Render restart wipes them — the user just re-clicks the button. Intentional (no DB churn for transient UI state).
- `action_items.priority` defaults to `'normal'`; only `'urgent'` is set by `mark_urgent_for_transcript`. The V3 → V4 migration adds this column.
- `topic_stats` / `people_stats` are REPLACED per window — not appended. `refresh_topic_window` deletes the user's rows where `window_end = today` before inserting new ones.
- `should_send_now` uses a ±7-minute window because cron fires every 15 minutes; this catches every slot exactly once without double-sending.
- The `insufficient_data` path in productivity is checked in TWO places: `_render_digest_html` and `_send_stats`. Both must stay in sync if the score shape changes.
- PowerShell 5.1 does NOT support `&&` between commands — use `;` or two separate calls (`cd video\app-and-bot-v1; npm run render`).
