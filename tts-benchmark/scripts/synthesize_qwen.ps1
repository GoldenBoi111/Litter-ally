$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content (Join-Path $root "config.json") -Raw | ConvertFrom-Json
$exe = Join-Path $root "runtime/audio/audiocpp_cli.exe"
if (-not (Test-Path $exe)) { throw "audio.cpp runtime missing. Run scripts/setup.ps1." }
$model = Join-Path $root "models/$($config.qwen.model)"
$output = Join-Path $root "outputs/qwen_teacher.wav"
$text = (Get-Content (Join-Path $root "passage.txt") -Raw).Trim()

& $exe --task tts --family qwen3_tts --model $model --backend cuda --text $text --speaker $config.qwen.speaker --instruct $config.qwen.instruction --language $config.qwen.language --seed $config.seed --session-option qwen3_tts.perf_mode=cuda_perf --log --out $output
if ($LASTEXITCODE -ne 0) { throw "Qwen synthesis failed with exit code $LASTEXITCODE" }
