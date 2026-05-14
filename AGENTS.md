# Audio Transcriber & Summariser - Agent Handoff

## Overview
Full-stack learning project for uploading audio, transcribing it, summarising it with AI, chatting about the audio, exporting PDFs, and saving transcript history. The owner is a beginner developer, so prefer clear, direct code and explain non-obvious changes.

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
  routes/process.py
  routes/chat.py
  routes/history.py        # currently unused
  services/groq_service.py
  services/supabase_service.py # currently unused
  models/schemas.py
  requirements.txt
  runtime.txt

frontend/src/
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
- Whisper transcription with `verbose_json`.
- Whisper segment timestamps returned as `transcript_segments`.
- AI summary and key points from Groq Llama.
- Output language options: English, Hindi, Gujarati, Tamil, Marathi, Bengali, Telugu, Kannada, Same as Original.
- Summary focus options: General Summary, Issues & Solutions, Q&A Format, Action Items, Key Decisions, Custom.
- Output format options: Bullet Points, Table, Paragraph.
- Summary length options: Short, Medium, Detailed.
- Detected source language pill shown in results.
- Markdown rendering for summaries, key points, transcript text, chat answers, and history details.
- Markdown table support in UI with horizontal scrolling.
- PDF export for summary, key points, and transcript.
- PDF export supports markdown tables through `jspdf-autotable`.
- Saved transcript history in Supabase.
- History page with expandable records and PDF export.
- Session-only chat over transcript/summary.
- Chat sends recent conversation history and avoids backend auth.
- Backend `/chat` answers only from the transcript/summary.
- Backend `/ping` exists for keep-alive services.
- Speaker detection/inference with Groq Llama.
- Backend returns `speaker_transcript` and `speaker_count`.
- Backend assigns `speaker` metadata directly onto timestamped transcript segments.
- Synced transcript playback using uploaded local browser file.
- Audio player below transcript with play/pause, seek bar, time display, and speed control.
- Keyboard shortcuts in audio player: Space toggles play/pause, Left/Right seek 5 seconds.
- Live transcript highlighting while audio plays.
- Clicking a transcript segment seeks audio to that timestamp and continues playback.
- Active transcript segment auto-scrolls smoothly into view.
- Transcript UI has `Synced` and `Plain` views.
- Separate `Speakers` tab was removed.
- `Speaker Mode` toggle shows speaker labels inline in both Synced and Plain views.
- Consecutive same-speaker segments use compact chips to reduce clutter.
- Current speaking indicator shown during synced playback.

## Architecture Decisions
- Backend is stateless: no auth checks and no DB writes.
- Frontend performs all Supabase auth/history reads and writes.
- Backend CORS is open with `allow_origins=["*"]` and `allow_credentials=False`.
- Backend receives multipart form data for `/process`.
- Single `/process` endpoint does transcription, summary, speaker inference, and returns all result data.
- Uploaded audio is not stored. Synced playback uses a local browser object URL for the selected file.
- Saved history does not support audio playback because audio files are not persisted.
- Speaker labels are attached to Whisper timestamp segments after LLM assignment. Whisper remains the source of timestamps.

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
user_id UUID,
audio_name VARCHAR,
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
created_at TIMESTAMP DEFAULT now()
```

Notes:
- `key_points` is stored as JSON-stringified text.
- `speaker_transcript` and `speaker_count` are used for saved metadata only.
- `transcript_segments` are live-session only for now and are not saved.

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
```

## Pending Tasks
1. Run/confirm Supabase speaker columns exist if not already done:
   ```sql
   ALTER TABLE transcripts
   ADD COLUMN speaker_transcript TEXT,
   ADD COLUMN speaker_count INTEGER;
   ```
2. Set up cron-job.org keep-alive hitting `https://audio-transcriber-summariser.onrender.com/ping` every 10 minutes.
3. Spot-check Brave/Chrome permission popup remains gone.
4. Test speaker assignment quality on real multi-speaker audio.
5. Decide whether transcript segments should be saved to history later.
6. Decide whether audio files should be stored later for history playback.
7. Consider chunking or async processing if `/process` latency becomes too high due to transcription + summary + speaker inference.

## Gotchas
- Render free tier can cold start for 30-60 seconds.
- The backend `.env` Supabase key must be JWT-style anon key if backend Supabase code is ever used; current backend DB code is unused.
- Frontend Supabase anon key can be `sb_publishable_`.
- Python 3.14 caused local install trouble before; Render pins Python through `runtime.txt`.
- Local venv may point to Python 3.14 on this machine even though Render uses the pinned runtime.
- `history.py` and `supabase_service.py` are currently unused.
- Old history rows may have null customization/speaker columns; UI should tolerate this.
- Do not add backend auth headers to frontend backend fetches unless the permission-popup issue is re-evaluated.
- Do not remove markdown table overflow wrappers; long tables can break mobile layout.
- PDF strips inline markdown bold because jsPDF body text does not switch fonts mid-line.
- Synced playback only works immediately after upload because the selected browser file is the audio source.
- Speaker labels are inferred, not true diarization, so they can be wrong on difficult audio.
- Keep code simple and explain changes clearly for the owner.

## Current Validation Status
- Frontend production build was run successfully with `npm.cmd run build`.
- Backend compile check was run successfully with the venv Python.
- `git diff --check` was run successfully.
