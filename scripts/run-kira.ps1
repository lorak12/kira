# Supervisor for running Kira in the background, forever.
#
# Launched at Windows logon by the "Kira" scheduled task (see
# scripts/install-startup.ps1) with its window hidden. Kira herself has no
# console/taskbar presence either (frame:false, skipTaskbar:true overlay
# window) -- the only thing on screen is the overlay orb.
#
# Runs `out/main/index.js` directly under electron.exe rather than `npm
# start`, so a launch failure is Kira's own exit code, not npm's wrapper
# noise. Restarts on ANY exit (crash, uncaught error, config problem, even a
# clean quit) since Kira is meant to just always be there -- there's no
# "intentional quit" path in the app today (the overlay window isn't
# closable). To actually stop her, stop/disable the "Kira" scheduled task
# (or kill this script's powershell.exe + the electron.exe it spawned).
#
# A crash loop (e.g. a bad config change) still backs off instead of
# hammering the machine: each restart waits a few seconds, and if she dies
# fast and repeatedly the wait grows, capped at 2 minutes.

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $repoRoot 'node_modules\.bin\electron.cmd'
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'kira.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Keep the log from growing forever -- truncate to the last ~5000 lines
# before each new run starts appending.
function Trim-Log {
  if (Test-Path $logFile) {
    $tail = Get-Content $logFile -Tail 5000
    Set-Content -Path $logFile -Value $tail -Encoding utf8
  }
}

$backoffSec = 5
$maxBackoffSec = 120

while ($true) {
  Trim-Log
  $startedAt = Get-Date
  Add-Content -Path $logFile -Value "`n===== [$($startedAt.ToString('o'))] starting Kira ====="

  # Pass the repo root (not out\main\index.js directly) so Electron reads
  # package.json's "name": "kira" and app.getName() comes out "kira" --
  # pointing electron.exe straight at a .js file instead leaves the app name
  # at the default "Electron", which puts userData (and so the single-
  # instance lock and its IPC pipe) in a different folder than a normal
  # `npm run dev`/`npm start` launch. That would let this supervised copy
  # and a manually-started one run side by side fighting over the mic
  # instead of the second one deferring to the first.
  Push-Location $repoRoot
  try {
    & $electron $repoRoot *>> $logFile
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  $ranFor = (Get-Date) - $startedAt
  Add-Content -Path $logFile -Value "===== [$((Get-Date).ToString('o'))] Kira exited (code $exitCode) after $([int]$ranFor.TotalSeconds)s ====="

  # A run that stayed up a while resets the backoff -- only a fast crash
  # loop should slow the retries down.
  if ($ranFor.TotalSeconds -gt 60) {
    $backoffSec = 5
  } else {
    $backoffSec = [Math]::Min($backoffSec * 2, $maxBackoffSec)
  }

  Start-Sleep -Seconds $backoffSec
}
