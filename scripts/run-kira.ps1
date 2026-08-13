# Supervisor for running Kira in the background, forever.
#
# Launched at Windows logon by the "Kira" scheduled task (see
# scripts/install-startup.ps1, via run-kira-hidden.vbs) with zero window.
# Kira herself has no console/taskbar presence either (frame:false,
# skipTaskbar:true overlay window) -- the only thing on screen is the
# overlay orb.
#
# Runs electron.exe directly rather than `npm start`, so a launch failure is
# Kira's own exit code, not npm's wrapper noise. Restarts on ANY exit (crash,
# uncaught error, config problem, even a clean quit) since Kira is meant to
# just always be there -- there's no "intentional quit" path in the app today
# (the overlay window isn't closable). To actually stop her, stop/disable the
# "Kira" scheduled task (or kill this script's powershell.exe + the
# electron.exe it spawned).
#
# A crash loop (e.g. a bad config change) still backs off instead of
# hammering the machine: each restart waits a few seconds, and if she dies
# fast and repeatedly the wait grows, capped at 2 minutes.

$repoRoot = Split-Path -Parent $PSScriptRoot
# node_modules\.bin\electron.cmd is a shim: it runs node.exe on electron\cli.js,
# which itself spawns the *real* electron.exe as a child process without
# windowsHide -- that's two extra console-subsystem processes (node.exe, and
# the console window it pops for the electron.exe child) sitting between the
# supervisor and Kira. Calling the real electron.exe directly cuts both
# extra hops out.
$electron = Join-Path $repoRoot 'node_modules\electron\dist\electron.exe'
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'kira.log'
$stdoutFile = Join-Path $logDir 'kira.out.tmp.log'
$stderrFile = Join-Path $logDir 'kira.err.tmp.log'

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

  # Start-Process -RedirectStandardOutput/-RedirectStandardError does real
  # OS-level file redirection, unlike the previous attempt here (a manual
  # System.Diagnostics.Process with Register-ObjectEvent callbacks): those
  # callbacks only fire when PowerShell's engine is idle between statements,
  # NOT while blocked inside a raw .NET WaitForExit() call -- so every line
  # Kira and the sidecar ever logged was silently getting dropped, the whole
  # time this looked like it was working. Start-Process -Wait has no such
  # gap. Two separate files (stdout/stderr) because Start-Process can't
  # redirect both to the same one; merged into the real log by timestamp
  # below since every line from logger.ts's log()/logError() already carries
  # one.
  if (Test-Path $stdoutFile) { Remove-Item $stdoutFile -Force }
  if (Test-Path $stderrFile) { Remove-Item $stderrFile -Force }

  try {
    $proc = Start-Process -FilePath $electron -ArgumentList "`"$repoRoot`"" `
      -WorkingDirectory $repoRoot -NoNewWindow -PassThru `
      -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile

    # Tail both temp files into the real log every couple seconds WHILE Kira
    # runs (not just once she exits) -- a background service you can only
    # read the log of after it dies isn't useful for live diagnosis. Each
    # line already carries its own timestamp (logger.ts's log()/logError()),
    # so appending stdout/stderr in whatever order they were last read in is
    # fine; a reader sorts/skims by that timestamp, not file order.
    $stdoutPos = 0
    $stderrPos = 0
    function Flush-NewLines([string]$path, [ref]$pos) {
      if (-not (Test-Path $path)) { return }
      $lines = Get-Content $path -ErrorAction SilentlyContinue
      if ($null -eq $lines) { return }
      if ($lines -isnot [array]) { $lines = @($lines) }
      if ($lines.Count -gt $pos.Value) {
        $lines[$pos.Value..($lines.Count - 1)] | Add-Content -Path $logFile
        $pos.Value = $lines.Count
      }
    }

    while (-not $proc.HasExited) {
      Start-Sleep -Seconds 2
      Flush-NewLines $stdoutFile ([ref]$stdoutPos)
      Flush-NewLines $stderrFile ([ref]$stderrPos)
    }
    Flush-NewLines $stdoutFile ([ref]$stdoutPos)
    Flush-NewLines $stderrFile ([ref]$stderrPos)
    $exitCode = $proc.ExitCode
  } catch {
    Add-Content -Path $logFile -Value "===== launch error: $($_.Exception.Message) ====="
    $exitCode = -1
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
