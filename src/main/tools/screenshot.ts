import { app, shell } from 'electron'
import { join } from 'path'
import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'

/** Builds the destination path for a new screenshot. Pure/testable -- no filesystem access. */
export function buildScreenshotPath(now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\..+/, '')
  return join(app.getPath('pictures'), 'Kira Screenshots', `screenshot-${stamp}.png`)
}

function buildCaptureScript(destPath: string): string {
  // Escaping: destPath is our own generated path (timestamp + fixed dirs),
  // never user input, so single-quote wrapping is sufficient here.
  const escaped = destPath.replace(/'/g, "''")
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent '${escaped}') | Out-Null
$bmp.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
`
}

export const screenshotTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'take_screenshot',
    description: "Captures a screenshot of the user's entire desktop (all monitors) and saves it to disk.",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    const destPath = buildScreenshotPath()
    try {
      await runPowerShell(buildCaptureScript(destPath))
      return `Saved a screenshot to ${destPath}.`
    } catch (err) {
      return `Couldn't take a screenshot: ${(err as Error).message}`
    }
  }
}

export const openScreenshotFolderTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'open_screenshots_folder',
    description: 'Opens the folder where Kira saves screenshots.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    const dir = join(app.getPath('pictures'), 'Kira Screenshots')
    await shell.openPath(dir)
    return 'Opened the screenshots folder.'
  }
}
