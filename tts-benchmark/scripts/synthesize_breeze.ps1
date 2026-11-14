$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content (Join-Path $root "config.json") -Raw | ConvertFrom-Json
$exe = Get-ChildItem (Join-Path $root "runtime/breeze") -Recurse -Filter "breeze-cli.exe" | Select-Object -First 1 -ExpandProperty FullName
if (-not $exe) { throw "Breeze runtime missing. Run scripts/setup.ps1." }
$model = Join-Path $root "models/$($config.breeze.model)"
$output = Join-Path $root "outputs/breeze_teacher.wav"
$text = (Get-Content (Join-Path $root "passage.txt") -Raw).Trim()

& $exe $model --text $text --instruction $config.breeze.instruction --cfg-scale $config.breeze.cfgScale --seed $config.seed --output $output --timings
if ($LASTEXITCODE -ne 0) { throw "Breeze synthesis failed with exit code $LASTEXITCODE" }
