import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ActivityEntry, type DisplayBoundsPayload, type KiraState, type PlayAudioPayload } from '../shared/ipc'

const kiraApi = {
  // Pulled once on mount so there's no race with the one-shot push the main
  // process used to rely on (see overlayWindow.ts). onDisplayBounds below
  // still covers later changes (monitor added/removed/rearranged).
  getDisplayBounds: (): Promise<DisplayBoundsPayload> => ipcRenderer.invoke(IPC.GET_DISPLAY_BOUNDS),
  onDisplayBounds: (cb: (payload: DisplayBoundsPayload) => void): (() => void) => {
    const listener = (_: unknown, payload: DisplayBoundsPayload): void => cb(payload)
    ipcRenderer.on(IPC.DISPLAY_BOUNDS, listener)
    return () => ipcRenderer.removeListener(IPC.DISPLAY_BOUNDS, listener)
  },
  onStateChanged: (cb: (state: KiraState) => void): (() => void) => {
    const listener = (_: unknown, state: KiraState): void => cb(state)
    ipcRenderer.on(IPC.STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC.STATE_CHANGED, listener)
  },
  onPlayAudio: (cb: (payload: PlayAudioPayload) => void): (() => void) => {
    const listener = (_: unknown, payload: PlayAudioPayload): void => cb(payload)
    ipcRenderer.on(IPC.PLAY_AUDIO, listener)
    return () => ipcRenderer.removeListener(IPC.PLAY_AUDIO, listener)
  },
  onStopAudio: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.STOP_AUDIO, listener)
    return () => ipcRenderer.removeListener(IPC.STOP_AUDIO, listener)
  },
  notifyPlaybackEnded: (): void => {
    ipcRenderer.send(IPC.PLAYBACK_ENDED)
  },
  setIgnoreMouse: (ignore: boolean): void => {
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE, ignore)
  },
  onActivity: (cb: (entry: ActivityEntry) => void): (() => void) => {
    const listener = (_: unknown, entry: ActivityEntry): void => cb(entry)
    ipcRenderer.on(IPC.ACTIVITY_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC.ACTIVITY_EVENT, listener)
  },
  onActivityReset: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.ACTIVITY_RESET, listener)
    return () => ipcRenderer.removeListener(IPC.ACTIVITY_RESET, listener)
  }
}

export type KiraApi = typeof kiraApi

contextBridge.exposeInMainWorld('kira', kiraApi)
