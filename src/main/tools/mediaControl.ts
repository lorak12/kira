import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ToolDefinition } from './types'

const execFileAsync = promisify(execFile)

// Virtual key codes for the OS-level media keys (same ones a hardware
// keyboard's media row sends), simulated via user32's keybd_event since
// Windows has no scriptable media-control API.
const VK_CODES: Record<string, number> = {
  play_pause: 0xb3,
  next: 0xb0,
  previous: 0xb1,
  volume_up: 0xaf,
  volume_down: 0xae,
  mute: 0xad
}

async function sendMediaKey(vk: number): Promise<void> {
  const script = `
Add-Type -TypeDefinition '
using System.Runtime.InteropServices;
public class KiraMediaKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
}';
[KiraMediaKey]::keybd_event(${vk}, 0, 0, [System.UIntPtr]::Zero);
[KiraMediaKey]::keybd_event(${vk}, 0, 2, [System.UIntPtr]::Zero);
`
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
}

export const mediaControlTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'media_control',
    description: "Controls system media playback (whatever app is currently playing audio -- Spotify, YouTube, etc.)",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The media action to perform',
          enum: ['play_pause', 'next', 'previous', 'volume_up', 'volume_down', 'mute']
        }
      },
      required: ['action']
    }
  },
  async execute(args) {
    const action = String(args.action ?? '')
    const vk = VK_CODES[action]
    if (!vk) return `Unknown media action "${action}".`
    await sendMediaKey(vk)
    return `Media action "${action}" performed.`
  }
}
