# Sets up the Python virtual environment for Kira's audio sidecar
# (wake-word detection via openWakeWord + local STT via faster-whisper).
#
# Verified working on Python 3.13. Uses `python3` explicitly since on some
# Windows setups a bare `python` resolves to an unrelated environment.

$ErrorActionPreference = "Stop"
$sidecarDir = Join-Path $PSScriptRoot "..\src\main\pySidecar"
$venvDir = Join-Path $sidecarDir ".venv"

if (-not (Test-Path $venvDir)) {
    Write-Host "Creating virtual environment at $venvDir"
    python3 -m venv $venvDir
}

$pip = Join-Path $venvDir "Scripts\pip.exe"
& $pip install --upgrade pip
& $pip install -r (Join-Path $sidecarDir "requirements.txt")

Write-Host ""
Write-Host "Done. Set sidecar.pythonPath in kira.config.json to:"
Write-Host "  $((Join-Path $venvDir 'Scripts\python.exe'))"
