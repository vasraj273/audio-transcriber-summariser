# Audio Transcriber & Summariser - Agent Handoff

## Overview
Full-stack learning project for uploading audio, transcribing it, summarising it with AI, chatting about the audio, exporting PDFs, saving transcript history, and comparing/merging past transcripts. The owner is a beginner developer, so prefer clear code and explain non-obvious changes.

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI, Python |
| Transcription | Groq Whisper `whisper-large-v3` |
| LLM | Groq Llama `llama-3.3-70b-versatile` |
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
  services/groq_service.py
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
- Whisper transcription with `verbose_json` and segment timestamps.
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
- Speaker detection/inference with Groq Llama.
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
- Whisper remains the source of timestamps; LLM only assigns speaker labels and analysis text.
- Music/noisy detection is heuristic over Whisper text/segments, not true waveform analysis.
- Compare/merge analysis is generated by Groq Llama from selected history records.

## Environment Variables
Backend:
- `GROQ_API_KEY`
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
1. Run/confirm `docs/supabase_processing_migration.sql` in Supabase before relying on job persistence.
2. Set up cron-job.org keep-alive hitting `https://audio-transcriber-summariser.onrender.com/ping` every 10 minutes.
3. Spot-check Brave/Chrome permission popup remains gone.
4. Test real uploads after migration: speech, song/music, noisy audio, multi-speaker meeting.
5. Test route navigation during processing and refresh recovery.
6. Test compare/merge on long real history records.
7. Decide whether audio files should be stored later for history playback.
8. Consider background queue/worker if Render request lifetime becomes a problem for long files.
9. Consider code-splitting frontend because Vite warns the main bundle is over 500 kB.

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
- Speaker labels are inferred, not true diarization.
- Music/noisy detection is heuristic and may need tuning after real samples.
- Sticky headers use `top-[61px]`; revisit if navbar height changes significantly.
- Keep code simple and explain changes clearly for the owner.

## Current Validation Status
- Frontend production build was run successfully with `npm.cmd run build`.
- Backend compile check was run successfully with the venv Python.
- `git diff --check` was run successfully earlier in the session.
