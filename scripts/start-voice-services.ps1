$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ttsRoot = Join-Path $root 'tts-benchmark'
$runtime = Join-Path $ttsRoot 'runtime'
$serverExe = Join-Path $runtime 'audio/audiocpp_server.exe'
$model = Join-Path $ttsRoot 'models/qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf'
if (-not (Test-Path $serverExe) -or -not (Test-Path $model)) { throw 'Run .\scripts\setup-voice.ps1 first.' }
$serverConfig = Join-Path $runtime 'qwen-server.json'
$pidPath = Join-Path $runtime 'qwen-server.pid'
$logPath = Join-Path $runtime 'qwen-server.log'
$modelPath = $model.Replace('\', '/')
@{
  host = '127.0.0.1'; port = 8187; backend = 'cuda'; device = 0; threads = 4
  lazy_load = $false; max_loaded_models = 1; ui = $false
  models = @(@{
    id = 'qwen3-custom'; family = 'qwen3_tts'; path = $modelPath; task = 'tts'; mode = 'streaming'
    session_options = @{ 'qwen3_tts.perf_mode' = 'cuda_perf' }
    default_voice_preset = @{ voice_id = 'Aiden' }
    default_request_options = @{ seed = 42; language = 'English' }
  })
} | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $serverConfig

try { Invoke-RestMethod http://127.0.0.1:8187/health -TimeoutSec 2 | Out-Null; Write-Host 'Qwen server is already running.'; & (Join-Path $PSScriptRoot 'start-voice-rtc.ps1'); return } catch { }
$process = Start-Process -FilePath $serverExe -ArgumentList @('--config', $serverConfig, '--log', '--log-file', $logPath) -WorkingDirectory (Join-Path $runtime 'audio') -WindowStyle Hidden -PassThru
$process.Id | Set-Content -Encoding ascii $pidPath
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) { throw "Qwen server exited. See $logPath" }
  try {
    $health = Invoke-RestMethod http://127.0.0.1:8187/health -TimeoutSec 3
    $models = Invoke-RestMethod http://127.0.0.1:8187/v1/models -TimeoutSec 3
    if ($health.status -eq 'ok' -and $models.data.Count -gt 0) { Write-Host "Qwen server ready at http://127.0.0.1:8187 (PID $($process.Id))."; & (Join-Path $PSScriptRoot 'start-voice-rtc.ps1'); return }
  } catch { }
  Start-Sleep -Seconds 2
}
throw "Timed out waiting for Qwen. See $logPath"
