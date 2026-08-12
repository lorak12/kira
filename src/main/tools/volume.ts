import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'

/** Clamps a requested volume percent into [0, 100]. Pure/testable. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

// There's no built-in Windows CLI for absolute volume, so this drives the
// Core Audio (WASAPI) IAudioEndpointVolume COM interface directly via a
// small inline C# shim, same idea as mediaControl.ts's media-key simulator.
function buildSetVolumeScript(level: number): string {
  const fraction = level / 100
  return `
Add-Type -TypeDefinition '
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f0(); int f1();
  int SetMasterVolumeLevelScalar(float level, System.Guid pguidEventContext);
  int f3(); int GetMasterVolumeLevelScalar(out float level);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, System.IntPtr activationParams, out IAudioEndpointVolume epv); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f0(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class KiraVolume {
  public static void SetVolume(float level) {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
    var epvId = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume epv; dev.Activate(ref epvId, 23, System.IntPtr.Zero, out epv);
    epv.SetMasterVolumeLevelScalar(level, System.Guid.Empty);
  }
}';
[KiraVolume]::SetVolume(${fraction})
`
}

export const setVolumeTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'set_volume',
    description: 'Sets the system output volume to an absolute percentage (0-100).',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Target volume, 0-100' }
      },
      required: ['level']
    }
  },
  async execute(args) {
    const level = clampPercent(Number(args.level))
    try {
      await runPowerShell(buildSetVolumeScript(level))
      return `Volume set to ${level}%.`
    } catch (err) {
      return `Couldn't set the volume: ${(err as Error).message}`
    }
  }
}
