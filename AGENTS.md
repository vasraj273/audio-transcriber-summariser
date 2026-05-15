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
  routes/history.py        # stale/unused route
  services/assemblyai_service.py  # transcription via AssemblyAI (current engine)
  services/groq_service.py        # summaries, chat, compare/merge, fallback infer_speakers, _build_speaker_transcript helper
  services/supabase_service.py
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
