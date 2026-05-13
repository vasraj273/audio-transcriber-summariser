# Project Summary

# Project Title
## Audio Transcriber and Summariser

---

# Project Description

The **Audio Transcriber and Summariser** is an AI-powered web application that allows users to upload audio recordings and automatically generate:

- Accurate transcripts
- Concise summaries
- Important key points

The platform is designed to simplify note-taking and information extraction from audio content such as:

- Lectures
- Meetings
- Interviews
- Podcasts
- Voice recordings

The application uses AI speech recognition models for transcription and large language models for summarization and key point extraction.

The primary goal of the project is to create a simple, fast, and cost-efficient plug-and-play solution where users can upload audio files and instantly receive organized notes.

---

# Main Features

- Google Sign-In Authentication
- Audio File Upload
- Speech-to-Text Transcription
- AI Summary Generation
- Key Point Extraction
- Copy-to-Clipboard Functionality
- User History Storage

---

# Tech Stack

## Frontend

- React.js
- Tailwind CSS

## Backend

- FastAPI

## AI Services

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

# System Workflow

```text
User Uploads Audio
        ↓
Backend Receives File
        ↓
Whisper API Generates Transcript
        ↓
Groq Llama 3.3 70B Generates Summary
        ↓
System Extracts Key Points
        ↓
Results Displayed to User
```

---

# Objective

The objective of this project is to automate audio understanding and note generation using AI technologies while maintaining:

- Fast processing
- Clean user experience
- Low operational cost

---

# Future Scope

- Multi-language support
- Speaker identification
- PDF export
- Real-time transcription
- AI chat with transcript
- Mobile application support

---