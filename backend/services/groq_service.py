import os
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
        )
    return {
        "text": response.text,
        "language": getattr(response, "language", "unknown"),
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
