# TRD (Technical Requirement Document)

# Project Title
## Audio Transcriber and Summariser

---

# 1. Technical Overview

The system is a full-stack AI-powered web application designed to process uploaded audio files and generate:

- Transcription
- Summaries
- Key points

The system uses:

- AI APIs for processing
- FastAPI backend
- React frontend
- Supabase for authentication and storage

---

# 2. System Architecture

```text
Frontend (React + Tailwind)
            ↓
FastAPI Backend
            ↓
AI Processing Layer
   ├── Whisper API
   └── Groq Llama 3.3 70B API
            ↓
Supabase Database
```

---

# 3. Frontend Architecture

## Framework

- React.js

## Styling

- Tailwind CSS

## State Management

- React Hooks

## Pages

### Login Page

#### Responsibilities

- Google Authentication
- Session handling

### Dashboard Page

#### Responsibilities

- Audio upload
- Display results
- Copy actions

---

# 4. Backend Architecture

## Framework

- FastAPI

## Responsibilities

- Handle uploads
- Manage AI requests
- Process summaries
- Store data
- Return API responses

---

# 5. AI Processing Pipeline

## Step 1 — Audio Upload

Frontend sends audio file to backend.

---

## Step 2 — Transcription

Backend sends audio to:

- Groq Whisper API

Returns:

- Transcript text

---

## Step 3 — Summarization

Transcript sent to:

- Groq Llama 3.3 70B

Prompt generates:

- Concise summary
- Key points

---

## Step 4 — Response Generation

Backend returns:

```json
{
  "transcript": "",
  "summary": "",
  "key_points": []
}
```

---

# 6. Database Design

## Database

- PostgreSQL (Supabase)

## Tables

### users

| Field | Type |
|---|---|
| id | UUID |
| email | VARCHAR |
| created_at | TIMESTAMP |

---

### transcripts

| Field | Type |
|---|---|
| id | UUID |
| user_id | UUID |
| audio_name | VARCHAR |
| transcript | TEXT |
| summary | TEXT |
| key_points | TEXT |
| created_at | TIMESTAMP |

---

# 7. API Design

## POST /upload

### Purpose

Upload audio file

### Input

- Multipart audio file

### Output

- File upload confirmation

---

## POST /transcribe

### Purpose

Generate transcript

### Output

```json
{
  "transcript": "..."
}
```

---

## POST /summarize

### Purpose

Generate summary

### Output

```json
{
  "summary": "...",
  "key_points": []
}
```

---

## GET /history

### Purpose

Fetch previous records

---

# 8. Authentication

## Provider

- Supabase Auth

## Method

- Google OAuth

---

# 9. File Handling

## Supported Formats

- mp3
- wav
- m4a

## Storage Strategy

Temporary backend storage during processing.

### Optional

- Cloud storage for future versions

---

# 10. Error Handling

| Scenario | Handling |
|---|---|
| Invalid file | Show upload error |
| API failure | Retry / error message |
| Empty audio | Validation error |
| Large file | Reject upload |

---

# 11. Security Requirements

- Secure API keys using environment variables
- JWT-based authentication
- HTTPS deployment
- File validation before processing

---

# 12. Performance Requirements

| Metric | Target |
|---|---|
| Upload Time | < 10 seconds |
| Transcription Speed | Near real-time |
| API Response | < 30 seconds |
| Concurrent Users | 20+ |

---

# 13. Deployment Architecture

## Frontend

### Platform

- Vercel

---

## Backend

### Platform

- Render

---

## Database

### Platform

- Supabase

---

# 14. Environment Variables

## Backend

```env
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
```

---

# 15. Development Workflow

```text
PRD Creation
      ↓
TRD Creation
      ↓
Frontend Setup
      ↓
Backend Setup
      ↓
AI Integration
      ↓
Database Integration
      ↓
Authentication
      ↓
Testing
      ↓
Deployment
```

---

# 16. Testing Strategy

## Unit Testing

- API endpoint testing

## Integration Testing

- Frontend-backend communication

## User Testing

- Real audio uploads

---

# 17. Cost Optimization Strategy

## Transcription

- Groq Whisper API
- Lower inference cost

## Summarization

- Groq Llama 3.3 70B
- Optimized prompts for lower token usage

## Database

- Supabase free tier

---

# 18. Future Technical Improvements

- Queue-based processing
- Real-time transcription
- Background workers
- WebSocket updates
- Local AI inference
- Vector database integration

---