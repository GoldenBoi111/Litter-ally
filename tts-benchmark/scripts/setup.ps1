param([switch]$SkipModels)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root "runtime"
$models = Join-Path $root "models"
New-Item -ItemType Directory -Force -Path $runtime, $models, (Join-Path $root "outputs"), (Join-Path $root "benchmarks/logs") | Out-Null
. (Join-Path $PSScriptRoot '..\..\scripts\download-verified.ps1')

$breezeZip = Join-Path $runtime "breeze-v0.1.7.zip"
$audioZip = Join-Path $runtime "audio-v0.9.4-cuda13.3.zip"
$cudartZip = Join-Path $runtime "audio-v0.9.4-cudart-cuda13.3.zip"
Get-VerifiedFile "https://github.com/HoppouAI/Breeze-TTS-2.cpp/releases/download/v0.1.7/breeze-tts-2-v0.1.7-windows-x64-vulkan.zip" $breezeZip "63FB117E5C6B04E33AC513D6CA80C621D01BDBDEBCF7A8486F872D181AE3C88F"
Get-VerifiedFile "https://github.com/0xShug0/audio.cpp/releases/download/v0.9.4/audio-v0.9.4-bin-windows-x64-cuda13.3.zip" $audioZip "B05ECEB8AA0A29E618B3AF87E0C2FD0FB665034D181096EB868ED856BF656B8B"
Get-VerifiedFile "https://github.com/0xShug0/audio.cpp/releases/download/v0.9.4/audio-v0.9.4-cudart-windows-x64-cuda13.3.zip" $cudartZip "B93FA9B9CB875CCEA1AA81CB09FD6B02C9AFDA133DE73BD119A73FF5D8DB6D96"

if (-not (Test-Path (Join-Path $runtime "breeze"))) { Expand-Archive $breezeZip (Join-Path $runtime "breeze") }
if (-not (Test-Path (Join-Path $runtime "audio"))) { Expand-Archive $audioZip (Join-Path $runtime "audio") }
if (-not (Test-Path (Join-Path $runtime "audio/cudart64_13.dll"))) { Expand-Archive $cudartZip (Join-Path $runtime "audio") }

if (-not $SkipModels) {
    Get-VerifiedFile "https://huggingface.co/HoppouAI/Breeze-TTS-2.cpp/resolve/e4fae6493ffb8bbeacc402d1b36f18dfa18fc8d5/breeze-tts-2-q8_0.gguf?download=true" (Join-Path $models "breeze-tts-2-q8_0.gguf") "A02BCC4B69B0601032727F8040C4942149B1B73AA0F69022FE5AAA6A8F0EF879"
    Get-VerifiedFile "https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/73ce4162f6cce370dd533c6782b772135c1b2a8e/Qwen3-TTS-12Hz-1.7B-CustomVoice-GGUF/qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf?download=true" (Join-Path $models "qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf") "C8AC3F94B6E73F137C0E7ECC9270BC8FAEC7A476FF799B87E48844D1D0987AC3"
}

Write-Host "Local TTS runtimes and models are ready."
