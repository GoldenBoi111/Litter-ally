$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$rtcPidPath = Join-Path $root 'tts-benchmark/runtime/voice-rtc.pid'
if (Test-Path $rtcPidPath) {
  $rtcPid = [int](Get-Content $rtcPidPath -Raw)
  $rtcProcess = Get-Process -Id $rtcPid -ErrorAction SilentlyContinue
  if ($rtcProcess -and $rtcProcess.ProcessName -eq 'python') { Stop-Process -Id $rtcPid -Force }
  Remove-Item -LiteralPath $rtcPidPath -Force
}
$pidPath = Join-Path $root 'tts-benchmark/runtime/qwen-server.pid'
if (-not (Test-Path $pidPath)) { Write-Host 'Managed WebRTC voice service stopped; no managed Qwen server was running.'; return }
$serverPid = [int](Get-Content $pidPath -Raw)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'audiocpp_server') { Stop-Process -Id $serverPid -Force }
Remove-Item -LiteralPath $pidPath -Force
Write-Host 'Managed Qwen and WebRTC voice services stopped.'
