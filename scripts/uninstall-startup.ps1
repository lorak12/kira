# Removes the "Kira" scheduled task installed by install-startup.ps1, and
# stops any currently running Kira/supervisor processes so she's fully gone
# instead of just not relaunching next boot.

$ErrorActionPreference = 'Stop'
$taskName = 'Kira'

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed scheduled task '$taskName'."
} else {
  Write-Host "No '$taskName' scheduled task found."
}

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like '*run-kira.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" |
  Where-Object { $_.CommandLine -like '*out\main\index.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host 'Kira stopped.'
