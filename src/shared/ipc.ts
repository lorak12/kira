export const IPC = {
  DISPLAY_BOUNDS: 'overlay:display-bounds',
  GET_DISPLAY_BOUNDS: 'overlay:get-display-bounds',
  SET_IGNORE_MOUSE: 'overlay:set-ignore-mouse',
  STATE_CHANGED: 'kira:state-changed',
  PLAY_AUDIO: 'kira:play-audio',
  STOP_AUDIO: 'kira:stop-audio',
  PLAYBACK_ENDED: 'kira:playback-ended',
  ACTIVITY_EVENT: 'kira:activity-event',
  ACTIVITY_RESET: 'kira:activity-reset'
} as const

export type KiraState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

export interface DisplayBoundsPayload {
  displays: Array<{ x: number; y: number; width: number; height: number }>
  primaryDisplay: { x: number; y: number; width: number; height: number }
  accentColor: string
}

export interface PlayAudioPayload {
  audioBase64: string
  mimeType: string
  // False for every chunk but the last one in a sentence-chunked reply (see
  // llm/sentenceSplit.ts + index.ts's speak()) -- lets the renderer queue
  // chunks back-to-back and only report playback finished once the whole
  // reply, not just one sentence, has played. Always true for a one-chunk
  // reply, which is most of them.
  isLast: boolean
}

// A single line in the secondary-display activity feed -- what the user
// said, which tool ran and what it returned, or what Kira replied. Kept
// deliberately terse (see truncate() at the call sites) since it's meant
// to be a glanceable "what is she doing" readout, not a full transcript.
export type ActivityKind = 'user' | 'tool' | 'reply'

export interface ActivityEntry {
  id: number
  kind: ActivityKind
  text: string
}
