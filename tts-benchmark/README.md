# Local teacher TTS benchmark

This project reproduces the two local clips in `outputs/`. It pins runtime releases, model revisions, seeds, checksums, voice settings, and the exact shared passage.

## Reproduce on Windows

Requirements: Windows 11, a current NVIDIA driver, PowerShell, `curl.exe`, and Python 3 for validation.

```powershell
cd tts-benchmark
./scripts/setup.ps1
./scripts/synthesize_breeze.ps1
./scripts/synthesize_qwen.ps1
python ./scripts/validate_outputs.py
```

The synthesis scripts load one model per process, so the models are never resident together. Models and runtime archives live in ignored `models/` and `runtime/` directories.

## Selected engines

Breeze uses the dedicated [Breeze-TTS-2.cpp v0.1.7](https://github.com/HoppouAI/Breeze-TTS-2.cpp/releases/tag/v0.1.7) Vulkan runtime and the recommended Q8_0 GGUF with the normal higher-precision depth decoder. The dedicated runtime is the upstream model package's documented primary engine, has Windows Vulkan binaries, voice design, reusable `.breeze` voices, and HTTP/WebSocket streaming. No NVIDIA-specific Breeze evidence showed that the broader audio.cpp runtime would improve quality or stability, so it was not substituted.

Qwen uses [audio.cpp v0.9.4](https://github.com/0xShug0/audio.cpp/releases/tag/v0.9.4) CUDA with its supported CustomVoice Q8_0 package and `cuda_perf` preset. On this machine it peaked around 5.05 GB total dedicated VRAM and completed stably. That is a better fit for 8 GB VRAM and the currently constrained system RAM than introducing the official PyTorch stack and full-precision weights. The source voice is the built-in Aiden preset; no voice cloning is involved.

## Voice identity and reuse

Breeze voice design is deterministic for the pinned model/settings and seed 42, but designed voices can still vary if any runtime, prompt, or sampling setting changes. To lock it to an identity later, generate a clean reference clip, then encode it once with `breeze-cli --ref-audio <clip.wav> --ref-text <exact transcript> --save-voice teacher --voices-dir voices`. Subsequent requests can use `--voice teacher`. The runtime stores the encoded voice as a reusable `.breeze` file.

Qwen Aiden is a packaged speaker embedding and is already stable across requests. The wrapper also fixes seed 42 and the style instruction.

## Results

See [benchmarks/results.md](benchmarks/results.md) for the comparison and [benchmarks/results.json](benchmarks/results.json) for machine-readable measurements. On this RTX 4060 Laptop GPU, Qwen's steady inference ran 2.49x faster than realtime; Breeze with CFG 3 ran 0.216x realtime. Both outputs passed WAV, duration, silence, clipping, and local ASR checks.

For this teaching assistant, Qwen/Aiden is the practical default: it is faster than realtime, uses less peak VRAM in this test, and preserves a fixed speaker identity. Breeze remains useful when reference-free voice design is more important than latency, but this exact high-guidance configuration is not responsive enough on the tested 55 W laptop GPU.

Qwen's persistent streaming server is integrated with the paper-board voice tutor. The app proxies phrase-sized requests and plays streamed PCM chunks; setup, startup, interruption handling, and current integrated latency results are documented in [the hybrid voice guide](../docs/hybrid-voice.md).

Model licenses still apply. Breeze weights use the BreezeBlue research/non-commercial license; Qwen3-TTS and audio.cpp are Apache-2.0.
