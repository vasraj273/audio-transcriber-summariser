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
