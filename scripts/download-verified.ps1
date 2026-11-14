function Get-VerifiedFile($Url, $Path, $Sha256) {
  if ((Test-Path $Path) -and (Get-FileHash $Path -Algorithm SHA256).Hash -ne $Sha256) {
    curl.exe -L --fail --retry 5 --continue-at - --output $Path $Url
    if ($LASTEXITCODE -eq 0 -and (Get-FileHash $Path -Algorithm SHA256).Hash -eq $Sha256) { return }
    Remove-Item -LiteralPath $Path -Force
  }
  if (-not (Test-Path $Path)) {
    curl.exe -L --fail --retry 5 --output $Path $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
  }
  if ((Get-FileHash $Path -Algorithm SHA256).Hash -ne $Sha256) { throw "Checksum mismatch: $Path" }
}
