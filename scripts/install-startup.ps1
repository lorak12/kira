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
$runnerScript = Join-Path $PSScriptRoot 'run-kira.ps1'

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoLogo -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerScript`""

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
