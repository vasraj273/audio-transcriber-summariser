import os
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def transcribe_audio(file_path: str) -> dict:
    with open(file_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segments = []
    for segment in getattr(response, "segments", []) or []:
        if isinstance(segment, dict):
            start = segment.get("start", 0)
            end = segment.get("end", start)
            text = segment.get("text", "")
        else:
            start = getattr(segment, "start", 0)
            end = getattr(segment, "end", start)
            text = getattr(segment, "text", "")

        segments.append({
            "start": float(start or 0),
            "end": float(end or start or 0),
            "text": str(text).strip(),
        })

    return {
        "text": response.text,
        "language": getattr(response, "language", "unknown"),
        "segments": [segment for segment in segments if segment["text"]],
    }


FOCUS_INSTRUCTIONS = {
    "General Summary": "Provide a balanced overview that captures the main themes and important details.",
    "Issues & Solutions": "Identify problems, blockers, or concerns raised in the audio, and pair each with any solutions, decisions, or next steps mentioned.",
    "Q&A Format": "Structure the summary as Question and Answer pairs, based on the questions raised and the answers or responses given.",
    "Action Items": "Focus only on concrete tasks, deadlines, and who is responsible. Skip background context.",
    "Key Decisions": "Focus on the decisions that were made, who made them, and the reasoning behind each decision.",
}

FORMAT_INSTRUCTIONS = {
    "Bullet Points": "Format the summary as a clean list of markdown bullet points (use '-' for each bullet).",
    "Table": "Format the summary as a markdown table. Choose 2-4 relevant columns based on the focus (e.g. for Issues & Solutions use | Issue | Solution |; for Action Items use | Task | Owner | Deadline |). Use proper markdown table syntax with pipes.",
    "Paragraph": "Format the summary as one or more flowing paragraphs of plain prose. Do not use bullets or tables.",
}

LENGTH_INSTRUCTIONS = {
    "Short": "Keep it very concise — 2 to 3 sentences, or 3 bullets/rows maximum.",
    "Medium": "Aim for a balanced length — 5 to 7 sentences, or 5 to 7 bullets/rows.",
    "Detailed": "Be thorough — 10 or more sentences, or 8 to 12 bullets/rows, including supporting context.",
}

KEY_POINTS_BY_LENGTH = {
    "Short": 3,
    "Medium": 5,
    "Detailed": 8,
}


def summarise_transcript(
    transcript: str,
    output_language: str = "English",
    focus: str = "General Summary",
    format: str = "Bullet Points",
    length: str = "Medium",
    custom_focus: str = "",
) -> dict:
    if output_language == "Same as Original":
        language_instruction = "Write your entire response in the same language as the transcript above. Do not translate."
    else:
        language_instruction = (
            f"Write your entire response in {output_language}. "
            f"If the transcript is in a different language, translate the content into {output_language}. "
            f"This applies to the summary AND the key points."
        )

    if focus == "Custom" and custom_focus.strip():
        focus_instruction = f"Focus the summary specifically on: {custom_focus.strip()}"
    else:
        focus_instruction = FOCUS_INSTRUCTIONS.get(focus, FOCUS_INSTRUCTIONS["General Summary"])

    format_instruction = FORMAT_INSTRUCTIONS.get(format, FORMAT_INSTRUCTIONS["Bullet Points"])
    length_instruction = LENGTH_INSTRUCTIONS.get(length, LENGTH_INSTRUCTIONS["Medium"])
    num_key_points = KEY_POINTS_BY_LENGTH.get(length, 5)

    prompt = f"""You are an expert assistant that processes audio transcripts (meetings, lectures, conversations).

Read the transcript below and produce TWO things:
1. A SUMMARY
2. A list of {num_key_points} KEY POINTS

Follow these instructions exactly:

LANGUAGE: {language_instruction}

FOCUS: {focus_instruction}

FORMAT: {format_instruction}

LENGTH: {length_instruction}

KEY POINTS RULE: The key points should always be a plain list of {num_key_points} short lines (one idea per line), regardless of the summary format. Each key point on its own line, prefixed with '- '.

Transcript:
\"\"\"
{transcript}
\"\"\"

Respond in EXACTLY this format and nothing else:

SUMMARY:
<your summary here, following the LANGUAGE, FOCUS, FORMAT, and LENGTH instructions>

KEY POINTS:
- <key point 1>
- <key point 2>
- <key point 3>
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    raw = response.choices[0].message.content
    return _parse_llm_response(raw)


def infer_speakers(transcript: str, segments: list | None = None) -> dict:
    if not transcript.strip():
        return {"speaker_transcript": "", "speaker_count": 0, "segments": []}

    if segments:
        return _infer_segment_speakers(transcript, segments)

    prompt = f"""You infer speaker turns from plain audio transcripts.

The transcript below may contain one or more speakers, but it has no speaker labels.
Your job is to reformat it only when speaker changes can be reasonably inferred from conversational cues.

Rules:
- Do not invent names, facts, or dialogue.
- Use labels like Speaker 1, Speaker 2, Speaker 3.
- Preserve the original meaning and wording as closely as possible.
- If there is only one clear speaker, keep the transcript as one Speaker 1 block.
- If speaker changes are uncertain, choose the smallest reasonable number of speakers.

Transcript:
\"\"\"
{transcript}
\"\"\"

Respond in EXACTLY this format and nothing else:

SPEAKER_COUNT:
<number>

SPEAKER_TRANSCRIPT:
Speaker 1: <text>
Speaker 2: <text>
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    raw = response.choices[0].message.content
    speaker_result = _parse_speaker_response(raw, transcript)
    return {
        **speaker_result,
        "segments": _apply_default_speaker(segments or [], speaker_result["speaker_count"]),
    }


def _infer_segment_speakers(transcript: str, segments: list) -> dict:
    numbered_segments = "\n".join(
        f"{index + 1}. [{segment['start']:.2f}-{segment['end']:.2f}] {segment['text']}"
        for index, segment in enumerate(segments)
    )

    prompt = f"""You infer speaker turns from timestamped transcript segments.

Each numbered line below is one transcript segment from Whisper. Assign exactly one speaker label to each segment.

Rules:
- Use labels like Speaker 1, Speaker 2, Speaker 3.
- Do not invent names.
- Do not rewrite transcript text.
- Keep the same speaker across consecutive lines when the same person appears to continue speaking.
- If speaker changes are uncertain, choose the smallest reasonable number of speakers.
- Return one assignment for every segment number.

Full transcript for context:
\"\"\"
{transcript}
\"\"\"

Timestamped segments:
{numbered_segments}

Respond in EXACTLY this format and nothing else:

SPEAKER_COUNT:
<number>

ASSIGNMENTS:
1|Speaker 1
2|Speaker 1
3|Speaker 2
"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
    )

    raw = response.choices[0].message.content
    assignments, speaker_count = _parse_segment_speaker_assignments(raw)
    speaker_segments = []

    for index, segment in enumerate(segments, start=1):
        speaker = assignments.get(index, "Speaker 1")
        speaker_segments.append({**segment, "speaker": speaker})

    labels = {segment["speaker"] for segment in speaker_segments if segment.get("speaker")}
    if labels:
        speaker_count = len(labels)

    return {
        "speaker_transcript": _build_speaker_transcript(speaker_segments),
        "speaker_count": max(speaker_count, 1),
        "segments": speaker_segments,
    }


def chat_with_audio(
    transcript: str,
    summary: str,
    history: list,
    question: str,
) -> str:
    system_prompt = f"""You are an AI assistant for a specific audio recording. Answer the user's questions ONLY using the transcript and summary provided below.

If the answer isn't in the audio content, say honestly: "That's not covered in this audio."

Be concise and conversational. Do not invent details. Do not use general knowledge unless the user explicitly asks for something obvious like a definition of a word.

---
SUMMARY OF THE AUDIO:
{summary}

---
FULL TRANSCRIPT:
{transcript}
"""

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-10:]:
        role = msg.get("role") if isinstance(msg, dict) else msg.role
        content = msg.get("content") if isinstance(msg, dict) else msg.content
        messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.4,
    )

    return response.choices[0].message.content.strip()


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


def _parse_speaker_response(raw: str, original_transcript: str) -> dict:
    speaker_transcript = original_transcript.strip()
    speaker_count = 1

    count_match = re.search(r"SPEAKER_COUNT:\s*(\d+)", raw, re.IGNORECASE)
    if count_match:
        speaker_count = int(count_match.group(1))

    if "SPEAKER_TRANSCRIPT:" in raw:
        speaker_transcript = raw.split("SPEAKER_TRANSCRIPT:", 1)[1].strip()
    elif "Speaker 1:" in raw:
        speaker_transcript = raw[raw.find("Speaker 1:"):].strip()

    labels = set(re.findall(r"\bSpeaker\s+(\d+)\s*:", speaker_transcript, re.IGNORECASE))
    if labels:
        speaker_count = max(speaker_count, len(labels))

    return {
        "speaker_transcript": speaker_transcript,
        "speaker_count": max(speaker_count, 1),
    }


def _parse_segment_speaker_assignments(raw: str) -> tuple[dict, int]:
    assignments = {}
    speaker_count = 1

    count_match = re.search(r"SPEAKER_COUNT:\s*(\d+)", raw, re.IGNORECASE)
    if count_match:
        speaker_count = int(count_match.group(1))

    for line in raw.splitlines():
        match = re.match(r"\s*(\d+)\s*[|:\-]\s*(Speaker\s+\d+)\s*$", line, re.IGNORECASE)
        if match:
            assignments[int(match.group(1))] = _normalize_speaker_label(match.group(2))

    return assignments, max(speaker_count, 1)


def _normalize_speaker_label(label: str) -> str:
    match = re.search(r"speaker\s+(\d+)", label, re.IGNORECASE)
    if not match:
        return "Speaker 1"
    return f"Speaker {int(match.group(1))}"


def _build_speaker_transcript(segments: list) -> str:
    lines = []
    current_speaker = ""
    current_text = []

    for segment in segments:
        speaker = segment.get("speaker") or "Speaker 1"
        text = segment.get("text", "").strip()
        if not text:
            continue

        if speaker != current_speaker and current_text:
            lines.append(f"{current_speaker}: {' '.join(current_text)}")
            current_text = []

        current_speaker = speaker
        current_text.append(text)

    if current_text:
        lines.append(f"{current_speaker}: {' '.join(current_text)}")

    return "\n".join(lines)


def _apply_default_speaker(segments: list, speaker_count: int = 1) -> list:
    speaker = "Speaker 1" if speaker_count <= 1 else ""
    return [{**segment, "speaker": segment.get("speaker") or speaker} for segment in segments]
