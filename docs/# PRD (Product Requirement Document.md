# PRD (Product Requirement Document)

# Project Title
## Audio Transcriber and Summariser

---

# 1. Project Overview

The **Audio Transcriber and Summariser** is an AI-powered web application that allows users to upload audio files and automatically generate:

- Full transcription
- Concise summaries
- Key discussion points

The platform is designed to simplify note-taking from:

- Lectures
- Meetings
- Interviews
- Podcasts
- Voice recordings

The application aims to provide a fast, simple, and user-friendly experience with minimal manual effort.

---

# 2. Problem Statement

People spend a significant amount of time manually listening to recordings and creating notes. Existing solutions are either:

- Expensive
- Complicated
- Not optimized for students and general users

This project solves the problem by automating:

- Speech-to-text conversion
- Summarization
- Important point extraction

---

# 3. Objectives

## Primary Objectives

- Convert uploaded audio into readable text
- Generate concise AI summaries
- Extract important key points
- Provide easy copy functionality

## Secondary Objectives

- Store user history
- Provide secure authentication
- Create scalable AI workflow
- Minimize API cost

---

# 4. Target Users

## Primary Users

- Students
- Teachers
- Professionals
- Content creators

## Use Cases

| User Type | Use Case |
|---|---|
| Students | Lecture summarization |
| Professionals | Meeting notes |
| Interviewers | Interview transcription |
| Content Creators | Podcast summaries |

---

# 5. Features

## 5.1 Core Features (MVP)

### User Authentication

- Google Sign-In
- Secure login/logout

### Audio Upload

Supported formats:

- MP3
- WAV
- M4A

### Audio Transcription

- Convert speech to text
- Display transcript in UI

### AI Summarization

Generate:

- Short summary
- Detailed summary

### Key Point Extraction

Display:

- Important points
- Action items

### Copy Functionality

- Copy transcript
- Copy summary
- Copy key points

---

## 5.2 Optional Features (Future Scope)

- Download as PDF
- Timestamp support
- Speaker detection
- Multi-language transcription
- Chat with transcript
- Dark mode
- Audio playback synchronization

---

# 6. User Flow

```text
User Login
     ↓
Dashboard
     ↓
Upload Audio File
     ↓
Audio Processing
     ↓
Transcription Generated
     ↓
Summary Generated
     ↓
Key Points Generated
     ↓
Copy / Save / Download
```

---

# 7. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | User should be able to login using Google |
| FR-2 | User should upload audio files |
| FR-3 | System should validate file format |
| FR-4 | System should transcribe audio |
| FR-5 | System should generate summaries |
| FR-6 | System should extract key points |
| FR-7 | User should copy generated content |
| FR-8 | User data should be stored securely |

---

# 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Fast transcription response |
| Scalability | Support multiple users |
| Security | Secure authentication |
| Reliability | Stable API responses |
| Usability | Simple and clean UI |
| Cost Efficiency | Low API usage cost |

---

# 9. Tech Stack

## Frontend

- React.js
- Tailwind CSS

## Backend

- FastAPI

## AI Models

### Transcription

- Groq Whisper API

### Summarization

- Groq Llama 3.3 70B

## Database & Authentication

- Supabase

## Deployment

### Frontend

- Vercel (Frontend)

### Backend

- Render (Backend)

---

# 10. Pages / Screens

## Login Page

### Features

- Google Sign-In

## Dashboard

### Features

- Audio upload
- Upload status
- Transcript display
- Summary display
- Key points display

---

# 11. API Requirements

| API | Purpose |
|---|---|
| `/upload` | Upload audio |
| `/transcribe` | Generate transcript |
| `/summarize` | Generate summary |
| `/history` | Retrieve saved records |

---

# 12. Success Criteria

Project will be considered successful if:

- User can upload audio successfully
- Accurate transcription is generated
- Summary is meaningful
- Processing time remains low
- Application works on live deployment

---

# 13. Constraints

- API usage limits
- File size restrictions
- Internet dependency
- AI response variability

---

# 14. Future Improvements

- Real-time transcription
- AI meeting assistant
- Team collaboration
- Mobile application
- Voice command integration

---