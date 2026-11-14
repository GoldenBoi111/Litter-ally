$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'tts-benchmark/runtime'
$pythonPath = Join-Path $runtime 'asr-python.path'
$python = if (Test-Path $pythonPath) { (Get-Content $pythonPath -Raw).Trim() } else { Join-Path $runtime 'asr/Scripts/python.exe' }
$pidPath = Join-Path $runtime 'voice-rtc.pid'
$logPath = Join-Path $runtime 'voice-rtc.log'
if (-not (Test-Path $python)) { throw 'Run .\scripts\setup-voice.ps1 first.' }
$envPath = Join-Path $root '.env'
if (Test-Path $envPath) {
  $settings = @('LOCAL_STT_MODEL', 'LOCAL_TTS_URL', 'LOCAL_TTS_MODEL', 'LOCAL_TTS_VOICE', 'VOICE_RTC_BIND', 'VOICE_RTC_PORT', 'VOICE_RTC_ALLOWED_ORIGINS', 'VOICE_RTC_DIAGNOSTICS', 'VOICE_RTC_STUN_URL')
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$' -and $settings -contains $Matches[1]) {
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      Set-Item -Path "Env:$($Matches[1])" -Value $value
    }
  }
}
if (-not $env:VOICE_RTC_DIAGNOSTICS) {
  if ($env:VOICE_RTC_BIND -and $env:VOICE_RTC_BIND -notin @('127.0.0.1', 'localhost', '::1')) { $env:VOICE_RTC_DIAGNOSTICS = 'false' }
  else { $env:VOICE_RTC_DIAGNOSTICS = 'true' }
}
try { Invoke-RestMethod http://127.0.0.1:8190/health -TimeoutSec 2 | Out-Null; Write-Host 'WebRTC voice service is already running.'; return } catch { }
$process = Start-Process -FilePath $python -ArgumentList (Join-Path $root 'server/voice_rtc.py') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $logPath -RedirectStandardError (Join-Path $runtime 'voice-rtc-error.log')
$process.Id | Set-Content -Encoding ascii $pidPath
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) { throw "WebRTC voice service exited. See $logPath" }
  try {
    $health = Invoke-RestMethod http://127.0.0.1:8190/health -TimeoutSec 3
    if ($health.status -eq 'ok') { Write-Host "WebRTC voice service ready at http://127.0.0.1:8190 (PID $($process.Id))."; return }
  } catch { }
  Start-Sleep -Seconds 2
}
throw "Timed out waiting for WebRTC voice service. See $logPath"
