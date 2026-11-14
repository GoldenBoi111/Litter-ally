# RTX 4060 Laptop benchmark

Measured locally on Windows 11 with an RTX 4060 Laptop GPU (8 GB), driver 621.14. Lower RTF is faster; throughput is audio seconds generated per inference second.

| | Breeze-TTS-2 | Qwen3-TTS |
|---|---:|---:|
| Runtime | Breeze-TTS-2.cpp v0.1.7 | audio.cpp v0.9.4 |
| Backend | Vulkan | CUDA 13.3 (`cuda_perf`) |
| Quantization | Q8_0, standard depth decoder | Q8_0 GGUF |
| Load/process overhead | 10.59 s estimated | 22.78 s measured |
| Steady inference | 297.35 s | 27.74 s |
| Audio duration | 64.24 s | 69.12 s |
| RTF (inference/audio) | 4.63 | 0.401 |
| Throughput | 0.216x realtime | 2.492x realtime |
| End-to-end wall | 307.95 s | 50.52 s |
| Peak dedicated VRAM, total | 5,636 MiB | 5,052 MiB |
| Increment above pre-run baseline | 4,769 MiB | 4,106 MiB |
| Average CPU, whole-machine scale | 7.21% | 4.86% |

Breeze's first-ever Vulkan request spent 30.06 seconds reaching first audio while compiling/warming GPU pipelines. The next short fresh-process request reached first audio in 0.527 seconds. For the full prompt, the runtime reported 10.292 seconds to first audio.

Qwen's warmed streaming server emitted its first PCM event in 1,493.83 ms. The short streaming request completed in 2.419 seconds. The full offline request ran 2.49x faster than realtime after load.

Both WAVs are 24 kHz mono 16-bit PCM, have nonzero duration, and contain zero clipped samples. A local Whisper `base.en` pass recovered every sentence with no dropped or repeated words. That check supports intelligibility and continuity, but it is not a substitute for subjective listening.

The initial Qwen launch failed before inference because the audio.cpp CUDA binary and NVIDIA runtime are separate release assets. The setup script now installs both matching v0.9.4 CUDA 13.3 archives.
