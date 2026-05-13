import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def transcribe_audio(file_path: str) -> str:
    with open(file_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=audio_file,
        )
    return response.text


def summarise_transcript(transcript: str) -> dict:
    prompt = f"""You are a helpful assistant that processes meeting and lecture transcripts.

Given the following transcript, provide:
1. A concise summary (3-5 sentences)
2. A list of 5 key points or action items

Transcript:
{transcript}

Respond in this exact format:
SUMMARY:
<your summary here>

KEY POINTS:
- <point 1>
- <point 2>
- <point 3>
- <point 4>
- <point 5>"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    return _parse_llm_response(raw)


def _parse_llm_response(raw: str) -> dict:
    summary = ""
    key_points = []

    if "SUMMARY:" in raw and "KEY POINTS:" in raw:
        parts = raw.split("KEY POINTS:")
        summary = parts[0].replace("SUMMARY:", "").strip()
        points_block = parts[1].strip()
        key_points = [
            line.lstrip("- ").strip()
            for line in points_block.splitlines()
            if line.strip().startswith("-")
        ]
    else:
        summary = raw.strip()

    return {"summary": summary, "key_points": key_points}
