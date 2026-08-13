' Launches run-kira.ps1 with truly zero window.
'
' Why this exists: the scheduled task used to invoke powershell.exe directly
' with -WindowStyle Hidden, but Windows 11's "default terminal application"
' feature (Windows Terminal, on by default since a recent Windows update)
' intercepts ANY console app launch -- even from Task Scheduler, even with
' -WindowStyle Hidden -- and hosts it inside a real, visible WindowsTerminal
' window (spawned via COM as "WindowsTerminal.exe -Embedding"). -WindowStyle
' Hidden only controls the classic conhost window; it does nothing against
' that newer delegation path. That's what kept showing up as a stray
' terminal on screen every time Kira launched.
'
' WScript.Shell.Run's window-style parameter (0 = SW_HIDE) suppresses the
' window at the Win32 CreateProcess level, one layer below where Windows
' Terminal's default-terminal delegation hooks in, so it isn't intercepted.
' This is the standard workaround for this exact Windows 11 quirk.

Dim fso, scriptDir, psScript
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = scriptDir & "\run-kira.ps1"

CreateObject("WScript.Shell").Run _
  "powershell.exe -NoLogo -NonInteractive -ExecutionPolicy Bypass -File """ & psScript & """", _
  0, False
