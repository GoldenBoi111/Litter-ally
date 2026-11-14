param([switch]$SkipModelWarmup)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ttsRoot = Join-Path $root 'tts-benchmark'
$runtime = Join-Path $ttsRoot 'runtime'
$audio = Join-Path $runtime 'audio'
$models = Join-Path $ttsRoot 'models'
$qwenModel = Join-Path $models 'qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf'
New-Item -ItemType Directory -Force -Path $runtime, $audio, $models | Out-Null
. (Join-Path $PSScriptRoot 'download-verified.ps1')

$audioExe = Join-Path $audio 'audiocpp_server.exe'
if (-not (Test-Path $audioExe)) {
  $zip = Join-Path $runtime 'audio-v0.9.4-cuda13.3.zip'
  Get-VerifiedFile 'https://github.com/0xShug0/audio.cpp/releases/download/v0.9.4/audio-v0.9.4-bin-windows-x64-cuda13.3.zip' $zip 'B05ECEB8AA0A29E618B3AF87E0C2FD0FB665034D181096EB868ED856BF656B8B'
  Expand-Archive $zip $audio -Force
}
$cudaRuntime = Join-Path $audio 'cudart64_13.dll'
if (-not (Test-Path $cudaRuntime)) {
  $zip = Join-Path $runtime 'audio-v0.9.4-cudart-cuda13.3.zip'
  Get-VerifiedFile 'https://github.com/0xShug0/audio.cpp/releases/download/v0.9.4/audio-v0.9.4-cudart-windows-x64-cuda13.3.zip' $zip 'B93FA9B9CB875CCEA1AA81CB09FD6B02C9AFDA133DE73BD119A73FF5D8DB6D96'
  Expand-Archive $zip $audio -Force
}
Get-VerifiedFile 'https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/73ce4162f6cce370dd533c6782b772135c1b2a8e/Qwen3-TTS-12Hz-1.7B-CustomVoice-GGUF/qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf?download=true' $qwenModel 'C8AC3F94B6E73F137C0E7ECC9270BC8FAEC7A476FF799B87E48844D1D0987AC3'

$asrPython = Join-Path $runtime 'asr/Scripts/python.exe'
if (-not (Test-Path $asrPython)) {
  $existing = Join-Path $runtime 'asr-check/Scripts/python.exe'
  if (Test-Path $existing) {
    & $existing -c 'import faster_whisper' 2>$null
    if ($LASTEXITCODE -eq 0) { $asrPython = $existing }
  }
  if ($asrPython -eq (Join-Path $runtime 'asr/Scripts/python.exe')) {
    $asrDir = Join-Path $runtime 'asr'
    if (-not (Test-Path $asrDir)) { python -m venv $asrDir }
    & $asrPython -m pip install 'faster-whisper==1.2.1'
    if ($LASTEXITCODE -ne 0) { throw 'faster-whisper installation failed.' }
  }
}
& $asrPython -m pip --version 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $asrPython -m ensurepip --upgrade
  if ($LASTEXITCODE -ne 0) { throw 'Could not bootstrap pip in the selected voice Python environment.' }
}
& $asrPython -m pip install -r (Join-Path $root 'server/requirements-voice-rtc.txt')
if ($LASTEXITCODE -ne 0) { throw 'WebRTC voice dependency installation failed.' }
$asrPython | Set-Content -Encoding ascii (Join-Path $runtime 'asr-python.path')
if (-not $SkipModelWarmup) {
  & $asrPython -c "import onnx_asr; onnx_asr.load_model('nemo-parakeet-tdt-0.6b-v2', quantization='int8', providers=['CPUExecutionProvider'])"
  if ($LASTEXITCODE -ne 0) { throw 'Could not download/load the Parakeet TDT 0.6B speech-to-text model.' }
}
$version = & $audioExe --version | Select-Object -First 1
if ($version -notmatch 'audio.cpp 0\.9\.4') { throw "Expected audio.cpp 0.9.4, found: $version" }
Write-Host "Voice dependencies ready ($version, Parakeet TDT 0.6B v2 int8 CPU, aiortc)."
