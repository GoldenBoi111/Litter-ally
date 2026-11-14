#!/usr/bin/env bash
# Runs the Mac voice stack in the foreground: Qwen3-TTS (MLX) on :8187 and the WebRTC/Whisper host on :8190.
# Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.voice-mac/bin/python
[[ -x "$PY" ]] || { echo "Run scripts/setup-voice-mac.sh first." >&2; exit 1; }
[[ -f .env ]] && { set -a; source .env; set +a; }

pids=()
cleanup() { [[ ${#pids[@]} -gt 0 ]] && kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if curl -fs -m 2 http://127.0.0.1:8187/health >/dev/null; then echo "Qwen TTS already running on :8187"
else (cd server && exec "../$PY" tts_mac.py) & pids+=($!); fi

for _ in $(seq 1 120); do curl -fs -m 2 http://127.0.0.1:8187/health >/dev/null && break; sleep 2; done
curl -fs -m 2 http://127.0.0.1:8187/health >/dev/null || { echo "Qwen TTS did not start." >&2; exit 1; }
echo "Qwen TTS ready on :8187"

if curl -fs -m 2 http://127.0.0.1:8190/health >/dev/null; then echo "Voice host already running on :8190"
else (cd server && exec "../$PY" voice_rtc.py) & pids+=($!); fi

for _ in $(seq 1 60); do curl -fs -m 2 http://127.0.0.1:8190/health >/dev/null && break; sleep 2; done
echo "Voice host ready on :8190"
# Stay in the foreground so `npm run app:mac` keeps running even when the services were already up.
if (( ${#pids[@]} )); then wait; else while :; do sleep 3600; done; fi
