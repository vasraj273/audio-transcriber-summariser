import os
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)


def save_transcript(
    user_id: str,
    audio_name: str,
    transcript: str,
    summary: str,
    key_points: list,
) -> None:
    try:
        _client.table("transcripts").insert({
            "user_id": user_id,
            "audio_name": audio_name,
            "transcript": transcript,
            "summary": summary,
            "key_points": json.dumps(key_points),
        }).execute()
    except Exception as e:
        import traceback
        print(f"[Supabase] Failed to save transcript: {e}")
        traceback.print_exc()


def get_history(user_id: str) -> list:
    try:
        response = (
            _client.table("transcripts")
            .select("id, audio_name, transcript, summary, key_points, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        records = response.data or []
        for record in records:
            if record.get("key_points"):
                try:
                    record["key_points"] = json.loads(record["key_points"])
                except Exception:
                    record["key_points"] = []
        return records
    except Exception as e:
        print(f"[Supabase] Failed to fetch history: {e}")
        return []
