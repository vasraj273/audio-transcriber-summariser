# Audio Transcriber & Summariser — Agent Context

## Overview
Full-stack web app: user signs in with Google, uploads audio (MP3/WAV/M4A), gets transcript + AI summary + key points. Supports translation, summary customization, follow-up chat, PDF export, and saved history. Built as a learning project — owner is a beginner developer, so prefer clarity over cleverness, and explain non-obvious changes.

---

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | FastAPI (Python 3.11) |
| Transcription | Groq Whisper (`whisper-large-v3`) |
| LLM | Groq Llama 3.3 70B (`llama-3.3-70b-versatile`) |
| Auth | Supabase Google OAuth |
| DB | Supabase PostgreSQL |
| PDF | jsPDF v4 + jspdf-autotable |
| Markdown | react-markdown + remark-gfm |

---

## Deployment
| Service | URL |
|---|---|
| Frontend | https://audio-transcriber-summariser.vercel.app (Vercel) |
| Backend | https://audio-transcriber-summariser.onrender.com (Render free tier) |
| Database | Supabase project `bvwjxezwenyjtmzddlsh` |

---

## Project Structure
```
backend/
  main.py                  FastAPI app, CORS open, registers process+chat routers
  routes/
    process.py             POST /process — transcribe + summarise + return
    chat.py                POST /chat — Q&A over transcript
    history.py             unused, kept around
  services/
    groq_service.py        transcribe_audio, summarise_transcript, chat_with_audio
    supabase_service.py    unused (frontend handles DB)
  models/schemas.py        ProcessResponse, ChatRequest, ChatResponse
  requirements.txt
  runtime.txt              python-3.11.0

frontend/src/
  pages/
    LoginPage.jsx          Google sign-in
    Dashboard.jsx          Upload + customization + results + chat
    HistoryPage.jsx        Past transcripts list
  components/
    Navbar.jsx
    AudioUploader.jsx
    CustomizationPanel.jsx 4 dropdowns: language, focus, format, length
    SummaryBox.jsx         renders summary via <Markdown>
    KeyPointsList.jsx
    TranscriptBox.jsx
    ChatPanel.jsx          follow-up Q&A with conversation history
    Markdown.jsx           react-markdown wrapper with Tailwind styling
    HistoryItem.jsx        expandable card with PDF download
  services/
    api.js                 processAudio, chatWithAudio
    supabase.js            client + saveTranscript + fetchHistory
  utils/
    downloadPDF.js         jsPDF + autotable for markdown tables
    copyText.js            clipboard with execCommand fallback
  vercel.json              SPA rewrites
```

---

## Features Built So Far

### Core (working in production)
- Google OAuth login via Supabase
- Audio upload (drag-drop or click), 25MB limit, mp3/wav/m4a
- Whisper transcription with **auto language detection** (`verbose_json`)
- Llama summarisation with key points
- Saved history (Supabase, frontend writes/reads directly)
- PDF export (header, summary, key points, transcript)

### Customization options on Dashboard (built earlier this session)
- **Output Language** — English, Hindi, Gujarati, Tamil, Marathi, Bengali, Telugu, Kannada, Same as Original. Llama handles translation in the same call as summarisation.
- **Summary Focus** — General / Issues & Solutions / Q&A Format / Action Items / Key Decisions / Custom (free-text).
- **Output Format** — Bullet Points / Table / Paragraph (Llama emits markdown).
- **Summary Length** — Short / Medium / Detailed (also scales key-points count: 3 / 5 / 8).
- Detected source language pill shown next to results.

### Markdown rendering (built earlier this session)
- `Markdown.jsx` wraps `ReactMarkdown` + `remark-gfm` with styled overrides for table, ul/ol, headings, strong, code.
- Applied in SummaryBox, KeyPointsList, TranscriptBox, HistoryItem (expanded), and ChatPanel (assistant bubbles).
- `downloadPDF.js` has a small line-by-line markdown parser that uses `jspdf-autotable` to render real bordered tables; bullets get `•` glyph; inline `**bold**` markers are stripped.

### Chat with Audio (built earlier this session)
- New backend `POST /chat`: body `{transcript, summary, messages, question}`, returns `{answer}`.
- System prompt locks the model to answer only from the transcript/summary; says "That's not covered in this audio" otherwise.
- `ChatPanel.jsx` below results — message bubbles (indigo user / gray assistant), Enter to send, typing-dot loader, 4 suggested-question chips on empty state.
- Conversation history is sent fresh with every request (LLMs are stateless). Trimmed to last 10 messages on both ends.
- Chat resets on new audio upload via `key={chatSessionId}` rerender trick.
- Chat is **not** persisted — session-only by design.

---

## Environment Variables (names only)

### Backend (Render dashboard)
- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY` ← must be the JWT-format `eyJ...` anon key, NOT `sb_publishable_`
- `ALLOWED_ORIGINS` ← set but unused (CORS is open)

### Frontend (Vercel dashboard)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` ← `sb_publishable_` format is fine here
- `VITE_BACKEND_URL`

---

## Supabase Schema
Table `transcripts`, RLS disabled, columns:
```
id UUID PK, user_id UUID, audio_name VARCHAR,
transcript TEXT, summary TEXT, key_points TEXT (JSON-stringified),
detected_language TEXT, output_language TEXT,
focus TEXT, format TEXT, summary_length TEXT,
created_at TIMESTAMP DEFAULT now()
```

---

## Pending Tasks (in priority order)

1. **Speaker detection feature** — PLANNED but not built. Approach: after Whisper, send transcript to Llama with prompt to infer speakers and reformat as `Speaker 1: ... / Speaker 2: ...`. Return `speaker_transcript` and `speaker_count`. Frontend shows a colored toggle in `TranscriptBox` (default ON, indigo/emerald/amber colors). Hide toggle when `speaker_count < 2`. Also pass speaker transcript into chat so Llama knows who said what. Pending SQL:
   ```sql
   ALTER TABLE transcripts
   ADD COLUMN speaker_transcript TEXT,
   ADD COLUMN speaker_count INTEGER;
   ```
   The owner was asked to run this in Supabase SQL Editor before the build proceeds. Unclear if they've run it yet.

2. **Set up cron-job.org keep-alive ping** — Render free tier sleeps after 15 min. Free cron job at cron-job.org hitting `https://audio-transcriber-summariser.onrender.com/ping` every 10 minutes. Without this, first request after idle takes 30-60s (especially painful on mobile).

3. **Verify permission popup is gone** — earlier issue where Brave/Chrome showed an "Access other apps and services" popup. Fixed architecturally (backend went stateless, no Authorization headers on cross-origin fetch). Worth a final spot-check on both browsers.

---

## Key Architectural Decisions
- **Backend is stateless.** No auth, no DB writes. Receives audio + options as multipart form, returns JSON. All DB ops happen on the frontend with the Supabase JS client. This was the fix for the cross-origin Authorization-header permission popup.
- **CORS is fully open** (`allow_origins=["*"]`, `allow_credentials=False`). Safe because backend holds no user data.
- **Single `/process` endpoint** does transcribe + summarise in one call. Combined for MVP simplicity.
- **All customization options are form fields**, not JSON, because they ride alongside the file upload in multipart form data.
- **Chat keeps context** by resending the full message history each turn (LLMs are stateless); 10-message cap on both sides for cost control.

---

## Local Development

```powershell
# Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload    # http://localhost:8000

# Frontend
cd frontend
npm run dev                  # http://localhost:5173
```

---

## Gotchas
- Supabase **backend** key must be JWT-format `eyJ...` (anon). The `sb_publishable_` format works only for the frontend JS client.
- Python 3.14 (owner's local default) breaks `pip install` due to `pyiceberg` needing C++ build tools. The venv uses Python 3.11; Render uses `runtime.txt` to pin 3.11.
- `key_points` is stored as a **JSON-stringified TEXT column** — `JSON.stringify` on save, `JSON.parse` on read. There's no JSON column type used.
- Whisper `verbose_json` returns `language` field — used for the detected-language pill. Whisper handles code-switching (Hinglish, Tanglish) but reports the dominant language.
- Markdown tables in the UI scroll horizontally inside `overflow-x-auto`. Don't remove that wrapper — long tables will break the layout on mobile.
- PDF `**bold**` markers are stripped because jsPDF body text doesn't easily switch fonts mid-line. Bold appears as plain text in the PDF.
- `history.py` and backend `supabase_service.py` exist but are unused. Can be cleaned later.
- Old history rows from before the customization-columns migration have NULL in those columns — UI tolerates this.
- The owner is a beginner. When making changes, explain *why* (especially around prompt engineering, React state, async patterns). Prefer editing existing files over creating new ones.
- Render cold start is 30-60s. Always warn the owner if their first request feels slow — they often think the app is broken.

---

## Useful Commands
```bash
# Deploy: just push, Vercel + Render auto-redeploy
git add . && git commit -m "..." && git push

# Check backend health
curl https://audio-transcriber-summariser.onrender.com/

# Check chat endpoint exists (after speaker work lands)
curl -X POST https://audio-transcriber-summariser.onrender.com/chat \
  -H "Content-Type: application/json" \
  -d '{"transcript":"hi","summary":"","messages":[],"question":"hello?"}'
```
