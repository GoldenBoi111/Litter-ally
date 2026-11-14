import json
import math
import struct
import wave
from pathlib import Path

root = Path(__file__).resolve().parent.parent
results = {}
for name in ("breeze_teacher.wav", "qwen_teacher.wav"):
    path = root / "outputs" / name
    with wave.open(str(path), "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        if wav.getsampwidth() != 2:
            raise ValueError(f"{name}: expected 16-bit PCM")
        samples = struct.unpack(f"<{len(frames) // 2}h", frames)
        peak = max(abs(value) for value in samples)
        clipped = sum(abs(value) == 32767 or value == -32768 for value in samples)
        duration = wav.getnframes() / wav.getframerate()
        if not math.isfinite(duration) or duration <= 0 or peak == 0:
            raise ValueError(f"{name}: invalid or silent audio")
        results[name] = {
            "duration_seconds": round(duration, 3),
            "sample_rate_hz": wav.getframerate(),
            "channels": wav.getnchannels(),
            "peak_dbfs": round(20 * math.log10(peak / 32768), 3),
            "clipped_samples": clipped,
        }

print(json.dumps(results, indent=2))
