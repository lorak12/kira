# Registers a Windows scheduled task ("Kira") that launches Kira, hidden, at
# every logon for the current user, and keeps her running via
# scripts/run-kira.ps1's own restart loop.
#
# A scheduled task (rather than a Startup-folder shortcut) is used so we can
# set MultipleInstances=IgnoreNew (a second logon/trigger can't spawn a
# duplicate) and remove the default ~3-day execution time limit that would
# otherwise kill a long-running background task.
#
# Safe to re-run: Register-ScheduledTask -Force overwrites the existing
# definition instead of erroring.

$ErrorActionPreference = 'Stop'
$taskName = 'Kira'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vbsLauncher = Join-Path $PSScriptRoot 'run-kira-hidden.vbs'

# Runs via wscript.exe -> run-kira-hidden.vbs -> WScript.Shell.Run(..., 0,
# False) rather than powershell.exe -WindowStyle Hidden directly. Windows
# 11's default-terminal-application feature hosts ANY console app launch
# (Task Scheduler included) inside a visible Windows Terminal window, and
# -WindowStyle Hidden doesn't suppress that delegation -- only
# WScript.Shell.Run's window-style parameter does. See run-kira-hidden.vbs.
$action = New-ScheduledTaskAction `
  -Execute 'wscript.exe' `
  -Argument "`"$vbsLauncher`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Description 'Launches Kira (voice assistant overlay) at logon and keeps her running.' `
  -Force | Out-Null

Write-Host "Registered scheduled task '$taskName' -- Kira will launch at your next logon."
Write-Host "To start her right now without logging off: Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Repo: $repoRoot"
