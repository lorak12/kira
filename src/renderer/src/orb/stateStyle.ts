import type { KiraState } from '@shared/ipc'

export interface OrbStyle {
  pulseSpeed: number
  glow: number
  whiteMix: number
}

// Each state gets a visually distinct pulse rate / brightness / color-mix so
// "is she listening yet" is readable at a glance, not just inferable from
// whether the orb happens to be moving. Shared between the orb shader and
// the perimeter HUD accents so the whole screen reads as one system.
export const STATE_STYLE: Record<KiraState, OrbStyle> = {
  idle: { pulseSpeed: 1.0, glow: 0.45, whiteMix: 0.0 },
  listening: { pulseSpeed: 4.0, glow: 1.4, whiteMix: 0.3 },
  transcribing: { pulseSpeed: 2.5, glow: 0.9, whiteMix: 0.1 },
  thinking: { pulseSpeed: 6.0, glow: 1.0, whiteMix: 0.5 },
  speaking: { pulseSpeed: 1.5, glow: 1.2, whiteMix: 0.0 }
}

// Normalized 0..1 "how active does this look" scale, for UI chrome (corner
// brackets, scan lines) that just needs brightness, not the full orb style.
export const STATE_INTENSITY: Record<KiraState, number> = {
  idle: 0.15,
  listening: 1.0,
  transcribing: 0.6,
  thinking: 0.75,
  speaking: 0.85
}

// Short text label shown near the orb so the current phase is readable at a
// glance, not just inferable from subtle pulse-speed/color differences.
export const STATE_LABEL: Record<KiraState, string> = {
  idle: '',
  listening: 'Listening…',
  transcribing: 'Understanding…',
  thinking: 'Thinking…',
  speaking: 'Speaking…'
}
