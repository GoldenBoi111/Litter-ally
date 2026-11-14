#!/usr/bin/env bash
# One-time local voice setup for Apple Silicon Macs: Parakeet (speech-to-text), aiortc (WebRTC)
# and Qwen3-TTS running on MLX (text-to-speech). Creates .voice-mac/ and warms both models.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "This script is for Apple Silicon Macs. On Windows use scripts/setup-voice.ps1." >&2; exit 1
fi

UV="$(command -v uv || true)"
if [[ -z "$UV" ]]; then
  python3 -m pip install --user --quiet uv
  UV="$(python3 -c 'import site,os;print(os.path.join(site.getuserbase(),"bin","uv"))')"
fi

"$UV" venv --allow-existing --python 3.12 .voice-mac
"$UV" pip install --python .voice-mac/bin/python -r server/requirements-voice-rtc.txt faster-whisper numpy mlx-audio

echo "Downloading and warming models (first run downloads both speech models)…"
.voice-mac/bin/python -c "import onnx_asr; onnx_asr.load_model('nemo-parakeet-tdt-0.6b-v2', quantization='int8', providers=['CPUExecutionProvider'])"
.voice-mac/bin/python -c "from mlx_audio.tts.utils import load_model; load_model('${MAC_TTS_MODEL:-mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit}')"
echo "Done. Start everything with: npm run app:mac"
