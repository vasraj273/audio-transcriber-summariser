import json
import logging
import os
import re
import time
from collections import Counter
from groq import Groq
from dotenv import load_dotenv

from services.analytics_service import record_api_call

load_dotenv()

logger = logging.getLogger(__name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

_PRIMARY_MODEL = "llama-3.3-70b-versatile"
_FALLBACK_MODEL = "llama-3.1-8b-instant"


def _is_rate_limit_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "429" in message or "rate_limit" in message or "rate limit" in message or "tokens per day" in message


def _llama_complete(messages: list, temperature: float = 0.3) -> str:
    started = time.perf_counter()
    try:
        response = client.chat.completions.create(
            model=_PRIMARY_MODEL,
            messages=messages,
            temperature=temperature,
        )
        record_api_call(
            provider="groq_llama",
            endpoint=_PRIMARY_MODEL,
            success=True,
            rate_limited=False,
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return response.choices[0].message.content
    except Exception as exc:
        is_rl = _is_rate_limit_error(exc)
        record_api_call(
            provider="groq_llama",
            endpoint=_PRIMARY_MODEL,
            success=False,
            rate_limited=is_rl,
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        if not is_rl:
            raise

    fallback_started = time.perf_counter()
    try:
        response = client.chat.completions.create(
            model=_FALLBACK_MODEL,
            messages=messages,
            temperature=temperature,
        )
        record_api_call(
            provider="groq_llama",
            endpoint=_FALLBACK_MODEL,
            success=True,
            rate_limited=False,
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - fallback_started) * 1000),
        )
        return response.choices[0].message.content
    except Exception as exc:
        record_api_call(
            provider="groq_llama",
            endpoint=_FALLBACK_MODEL,
            success=False,
            rate_limited=_is_rate_limit_error(exc),
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - fallback_started) * 1000),
            error_message=str(exc),
        )
        raise


def transcribe_audio(file_path: str) -> dict:
    started = time.perf_counter()
    try:
        with open(file_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
    except Exception as exc:
        record_api_call(
            provider="groq_whisper",
            endpoint="whisper-large-v3",
            success=False,
            rate_limited=_is_rate_limit_error(exc),
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        raise
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

    duration = max((segment["end"] for segment in segments), default=0)
    record_api_call(
        provider="groq_whisper",
        endpoint="whisper-large-v3",
        success=True,
        rate_limited=False,
        duration_seconds=duration,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return {
        "text": response.text,
        "language": getattr(response, "language", "unknown"),
        "segments": [segment for segment in segments if segment["text"]],
        "duration": duration,
    }


def assess_transcription_quality(transcription: dict) -> dict:
    text = (transcription.get("text") or "").strip()
    segments = transcription.get("segments") or []
    duration = float(transcription.get("duration") or 0)
    flags = []

    if not text or len(text) < 20:
        flags.append("very_little_speech_detected")

    words = re.findall(r"\b[\w']+\b", text, flags=re.UNICODE)
    word_count = len(words)
    speech_density = word_count / max(duration, 1)
    if duration > 20 and speech_density < 0.45:
        flags.append("low_speech_density")

    unique_ratio = len({word.lower() for word in words}) / max(word_count, 1)
    if word_count > 40 and unique_ratio < 0.25:
        flags.append("repetitive_or_looped_text")

    scripts = _detect_scripts(text)
    if len(scripts) >= 4:
        flags.append("unstable_mixed_scripts")

    non_latin_ratio = _non_latin_ratio(text)
    if non_latin_ratio > 0.45 and transcription.get("language") in {"en", "unknown"}:
        flags.append("unexpected_script_for_language")

    short_segments = [
        segment for segment in segments
        if len(segment.get("text", "").split()) <= 2 and (segment.get("end", 0) - segment.get("start", 0)) > 2.5
    ]
    if segments and len(short_segments) / len(segments) > 0.45:
        flags.append("sparse_inconsistent_segments")

    repeated_phrases = _count_repeated_phrases(text)
    if repeated_phrases >= 4:
        flags.append("repeated_phrase_hallucination")

    score = 1.0
    score -= 0.22 * len(flags)
    if speech_density < 0.35:
        score -= 0.2
    if len(scripts) >= 3:
        score -= 0.12
    score = max(0.0, min(1.0, score))

    has_meaningful_text = bool(text) and word_count >= 3
    looks_like_music = (
        "low_speech_density" in flags
        and ("unstable_mixed_scripts" in flags or "repeated_phrase_hallucination" in flags)
    )

    if not has_meaningful_text:
        audio_type = "empty_audio"
    elif looks_like_music and word_count < 60:
        audio_type = "music_song"
    elif _looks_like_interview_or_podcast(text):
        audio_type = "podcast_interview"
    elif _looks_like_meeting(text):
        audio_type = "meeting_call"
    elif flags or score < 0.7:
        audio_type = "noisy_speech"
    else:
        audio_type = "speech_conversation"

    warning = ""
    if audio_type == "music_song":
        warning = "This audio appears to be music/song content. Accurate speech transcription may not be possible."
    elif audio_type == "empty_audio":
        warning = "This audio does not appear to contain any speech."
    elif audio_type == "noisy_speech":
        warning = "Background noise detected. Transcript accuracy may be reduced."

    return {
        "audio_type": audio_type,
        "quality_score": round(score, 2),
        "quality_flags": flags,
        "warning": warning,
        "is_supported": audio_type not in {"music_song", "empty_audio"},
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

    raw = _llama_complete([{"role": "user", "content": prompt}], temperature=0.3)
    return _parse_llm_response(raw)


# ---------------------------------------------------------------------------
# Transcript translation (drives the "Output Language" UI control end-to-end).
# Source words come back from AssemblyAI / Groq Whisper in the audio's source
# language. When the user picks a different output language we translate every
# segment via a Llama pass and reuse the same timestamps and speaker labels.
# ---------------------------------------------------------------------------

_LANGUAGE_CODE_HINTS = {
    "english": ("en",),
    "spanish": ("es",),
    "french": ("fr",),
    "german": ("de",),
    "italian": ("it",),
    "portuguese": ("pt",),
    "hindi": ("hi",),
    "urdu": ("ur",),
    "arabic": ("ar",),
    "chinese": ("zh",),
    "japanese": ("ja",),
    "korean": ("ko",),
    "russian": ("ru",),
    "bengali": ("bn",),
    "punjabi": ("pa",),
    "turkish": ("tr",),
    "dutch": ("nl",),
}


def languages_match(detected_code: str, target_label: str) -> bool:
    """True when the AssemblyAI/Whisper detected language code (e.g. ``"en"``)
    matches the user-selected target language label (e.g. ``"English"``).
    Used to skip a translation pass that would be a no-op."""
    if not detected_code or not target_label:
        return False
    prefixes = _LANGUAGE_CODE_HINTS.get(target_label.strip().lower(), ())
    code = detected_code.lower()
    return any(code.startswith(p) for p in prefixes)


def translate_segments(segments: list, target_language: str) -> list:
    """Translate the ``text`` field on every segment into ``target_language``.

    Preserves ``start``, ``end``, ``speaker``, and any other keys. Falls back
    to the original text on parse/LLM failure so the user still sees something.
    Batches segments to keep individual prompts under ~3000 chars.
    """
    if not segments or not target_language:
        return segments

    translated = [dict(seg) for seg in segments]
    for batch_indices in _chunk_segments_for_translation(segments):
        payload = [
            {"i": i, "text": (segments[i].get("text") or "").strip()}
            for i in batch_indices
        ]
        try:
            new_texts = _translate_payload(payload, target_language)
        except Exception as exc:
            logger.warning("translate_segments batch failed (%s); keeping originals.", exc)
            continue
        for i, text in new_texts.items():
            if 0 <= i < len(translated) and text:
                translated[i]["text"] = text
    return translated


def translate_text(text: str, target_language: str) -> str:
    """Translate a single chunk of free-form transcript text. Used when no
    segments are available (e.g. older history rows). Returns the original
    on failure."""
    if not text or not target_language:
        return text
    try:
        instructions = (
            f"Translate the user's text into {target_language}. "
            "Preserve meaning, tone, and paragraph breaks. "
            "Return ONLY the translated text — no preface, no explanation, no quotes."
        )
        raw = _llama_complete(
            [
                {"role": "system", "content": instructions},
                {"role": "user", "content": text},
            ],
            temperature=0.2,
        )
        return (raw or "").strip() or text
    except Exception as exc:
        logger.warning("translate_text failed (%s); returning original.", exc)
        return text


def _chunk_segments_for_translation(segments: list, max_chars: int = 2800) -> list:
    chunks: list[list[int]] = []
    current: list[int] = []
    current_chars = 0
    for i, seg in enumerate(segments):
        size = len((seg.get("text") or "")) + 24  # overhead for JSON keys
        if current and current_chars + size > max_chars:
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(i)
        current_chars += size
    if current:
        chunks.append(current)
    return chunks


def _translate_payload(payload: list, target_language: str) -> dict:
    instructions = (
        f"You are a precise translator. Translate every item's `text` field into {target_language}. "
        "Preserve meaning and tone. Do NOT add commentary or notes. "
        "Return JSON only — a single array of objects, each with keys `i` (the original integer index "
        "from the input, copied unchanged) and `text` (the translated string). "
        "Include every index from the input. Do not wrap the array in any other key. "
        "Do not include code fences."
    )
    user_payload = json.dumps(payload, ensure_ascii=False)
    raw = _llama_complete(
        [
            {"role": "system", "content": instructions},
            {"role": "user", "content": user_payload},
        ],
        temperature=0.2,
    )
    parsed = _safe_extract_json_array(raw)
    result: dict[int, str] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("i"))
        except (TypeError, ValueError):
            continue
        text = item.get("text")
        if isinstance(text, str):
            result[idx] = text.strip()
    return result


def _safe_extract_json_array(raw: str) -> list:
    if not raw:
        return []
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        data = json.loads(text[start : end + 1])
    except Exception:
        return []
    return data if isinstance(data, list) else []


def compare_transcripts(records: list) -> str:
    content = _format_records_for_analysis(records)
    prompt = f"""Compare these transcript records for a professional user.

Create a concise markdown report with:
- Executive comparison
- Side-by-side themes
- Key similarities
- Key differences
- Follow-up questions or risks

Records:
{content}
"""
    return _run_analysis_prompt(prompt)


def merge_transcripts(records: list) -> str:
    content = _format_records_for_analysis(records)
    prompt = f"""Merge these transcript records into one clean set of notes.

Create a concise markdown report with:
- Combined summary
- Deduplicated key points
- Action items or decisions if present
- Organized notes by topic

Avoid repeating the same point twice.

Records:
{content}
"""
    return _run_analysis_prompt(prompt)


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

    raw = _llama_complete([{"role": "user", "content": prompt}], temperature=0.1)
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

    raw = _llama_complete([{"role": "user", "content": prompt}], temperature=0.1)
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

    return _llama_complete(messages, temperature=0.4).strip()


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


def _detect_scripts(text: str) -> set:
    scripts = set()
    for char in text:
        code = ord(char)
        if 0x0041 <= code <= 0x007A:
            scripts.add("latin")
        elif 0x0600 <= code <= 0x06FF:
            scripts.add("arabic")
        elif 0x0900 <= code <= 0x097F:
            scripts.add("devanagari")
        elif 0x0A00 <= code <= 0x0A7F:
            scripts.add("gurmukhi")
        elif 0x0B80 <= code <= 0x0BFF:
            scripts.add("tamil")
        elif 0x0C00 <= code <= 0x0C7F:
            scripts.add("telugu")
        elif 0x0C80 <= code <= 0x0CFF:
            scripts.add("kannada")
        elif 0x0980 <= code <= 0x09FF:
            scripts.add("bengali")
    return scripts


def _non_latin_ratio(text: str) -> float:
    letters = [char for char in text if char.isalpha()]
    if not letters:
        return 0
    non_latin = [char for char in letters if ord(char) > 0x024F]
    return len(non_latin) / len(letters)


def _count_repeated_phrases(text: str) -> int:
    words = [word.lower() for word in re.findall(r"\b[\w']+\b", text, flags=re.UNICODE)]
    phrases = [" ".join(words[i:i + 3]) for i in range(max(0, len(words) - 2))]
    counts = Counter(phrases)
    return sum(1 for count in counts.values() if count >= 3)


def _looks_like_meeting(text: str) -> bool:
    terms = {"meeting", "agenda", "action", "deadline", "decision", "project", "client", "team"}
    lower = text.lower()
    return sum(1 for term in terms if term in lower) >= 2


def _looks_like_interview_or_podcast(text: str) -> bool:
    terms = {"welcome", "episode", "podcast", "interview", "question", "guest", "host"}
    lower = text.lower()
    return sum(1 for term in terms if term in lower) >= 2


def _format_records_for_analysis(records: list) -> str:
    blocks = []
    for index, record in enumerate(records[:6], start=1):
        key_points = record.get("key_points") or record.get("keyPoints") or []
        if isinstance(key_points, list):
            points = "\n".join(f"- {point}" for point in key_points[:10])
        else:
            points = str(key_points)
        transcript = (record.get("transcript") or "")[:6000]
        blocks.append(
            f"""Record {index}: {record.get('audio_name') or record.get('audioName') or 'Untitled'}
Language: {record.get('detected_language') or 'unknown'}
Speaker count: {record.get('speaker_count') or 'unknown'}
Summary:
{record.get('summary') or ''}
Key points:
{points}
Transcript excerpt:
{transcript}
"""
        )
    return "\n---\n".join(blocks)


def _run_analysis_prompt(prompt: str) -> str:
    return _llama_complete([{"role": "user", "content": prompt}], temperature=0.25).strip()
