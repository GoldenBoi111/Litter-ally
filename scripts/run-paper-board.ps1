$ErrorActionPreference = 'Stop'
function Test-PortAvailable([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try { $listener.Start(); return $true }
  catch { return $false }
  finally { $listener.Stop() }
}
$apiPort = 5186
while (-not (Test-PortAvailable $apiPort)) { $apiPort += 1 }
$env:PAPER_BOARD_PORT = [string]$apiPort
$env:PAPER_BOARD_API_URL = "http://127.0.0.1:$apiPort"
Write-Host "Using local API port $apiPort."
try {
  & (Join-Path $PSScriptRoot 'start-voice-services.ps1')
  npm run dev
}
finally { & (Join-Path $PSScriptRoot 'stop-voice-services.ps1') }
