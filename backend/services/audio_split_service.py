import logging
import os
import re
import subprocess
import tempfile

import imageio_ffmpeg

logger = logging.getLogger(__name__)

# Audio shorter than this stays single-pass: forcing 3 sub-20s chunks hurts
# transcription quality more than cross-part coherence helps.
SPLIT_THRESHOLD_SECONDS = 60.0
NUM_PARTS = 3

_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)")


def _ffmpeg_exe() -> str:
    """Path to the static ffmpeg binary bundled by imageio-ffmpeg (no system
    install needed on Render)."""
    return imageio_ffmpeg.get_ffmpeg_exe()


def get_duration_seconds(file_path: str) -> float:
    """Probe audio duration by parsing ffmpeg's stderr banner. imageio-ffmpeg
    ships ffmpeg but not ffprobe, so we read the "Duration:" line instead."""
    proc = subprocess.run(
        [_ffmpeg_exe(), "-i", file_path],
        capture_output=True,
        text=True,
    )
    match = _DURATION_RE.search(proc.stderr or "")
    if not match:
        return 0.0
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def split_into_parts(file_path: str, num_parts: int = NUM_PARTS) -> list:
    """Split audio into ``num_parts`` equal sequential chunks, re-encoded to
    mono 16 kHz WAV. Re-encoding (not stream-copy) gives clean cuts at the
    arbitrary time boundaries. Returns ordered temp paths; caller deletes."""
    duration = get_duration_seconds(file_path)
    if duration <= 0:
        raise RuntimeError("Could not determine audio duration for splitting.")

    part_len = duration / num_parts
    exe = _ffmpeg_exe()
    paths: list = []
    for i in range(num_parts):
        start = i * part_len
        handle = tempfile.NamedTemporaryFile(delete=False, suffix=f".part{i + 1}.wav")
        handle.close()
        cmd = [
            exe, "-y",
            "-ss", f"{start:.3f}",
            "-t", f"{part_len:.3f}",
            "-i", file_path,
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            handle.name,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not os.path.exists(handle.name) or os.path.getsize(handle.name) == 0:
            # Clean up anything created so far before bailing.
            for done in paths + [handle.name]:
                try:
                    os.remove(done)
                except OSError:
                    pass
            raise RuntimeError(
                f"ffmpeg split failed for part {i + 1}: {(proc.stderr or '')[-500:]}"
            )
        paths.append(handle.name)

    logger.info("Audio split into %d parts (~%.1fs each).", num_parts, part_len)
    return paths
