$ErrorActionPreference = 'Stop'
$payload = 'verified payload'
$expectedFile = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + '.expected')
[IO.File]::WriteAllText($expectedFile, $payload)
$expectedHash = (Get-FileHash $expectedFile -Algorithm SHA256).Hash
$script:downloadCalls = 0

function curl.exe {
  $script:downloadCalls++
  if ($args -contains '--continue-at') { $global:LASTEXITCODE = 22; return }
  $outputIndex = [Array]::IndexOf($args, '--output')
  [IO.File]::WriteAllText($args[$outputIndex + 1], $payload)
  $global:LASTEXITCODE = 0
}

try {
  foreach ($scriptPath in @('scripts/setup-voice.ps1', 'tts-benchmark/scripts/setup.ps1')) {
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath), [ref]$tokens, [ref]$errors)
    if ($errors) { throw ($errors | Out-String) }
    if (-not (Select-String -Path $scriptPath -SimpleMatch 'download-verified.ps1' -Quiet)) { throw "$scriptPath does not load the shared download helper" }
  }
  . (Join-Path $PSScriptRoot 'download-verified.ps1')
  foreach ($scriptPath in @('scripts/setup-voice.ps1', 'tts-benchmark/scripts/setup.ps1')) {
    $target = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + '.download')
    try {
      [IO.File]::WriteAllText($target, 'corrupt payload')
      Get-VerifiedFile 'https://example.invalid/file' $target $expectedHash
      if ((Get-FileHash $target -Algorithm SHA256).Hash -ne $expectedHash -or $script:downloadCalls -lt 2) {
        throw "Corrupt-cache recovery failed in $scriptPath"
      }
    } finally {
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    }
    Write-Output "Corrupt-cache recovery passed: $scriptPath"
  }
} finally {
  Remove-Item -LiteralPath $expectedFile -Force -ErrorAction SilentlyContinue
}
