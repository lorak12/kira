import type { ToolDefinition } from './types'
import { hideOverlay, showOverlay } from '../overlay/overlayWindow'

// Purely visual -- toggles the overlay window's OS-level visibility. Doesn't
// touch the session, the sidecar's mic, or wake-word detection, all of which
// keep running while hidden (see overlayWindow.ts's hideOverlay/showOverlay
// doc comments). A subsequent wake word or proactive announcement
// (index.ts's 'wake' handler / announceProactively) calls showOverlay()
// itself, so hiding here doesn't strand the user with a permanently invisible
// assistant.

export const hideOverlayTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'hide_overlay',
    description:
      'Hides Kira\'s on-screen overlay (the orb/HUD) while leaving everything else running -- keeps listening for the wake word and can still be talked to, it just stops showing visual feedback. Use this for requests like "hide", "go away", "ukryj się" that mean "get out of my view", not "lock_screen" or "close_app" or "end_conversation".',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    hideOverlay()
    return 'Overlay hidden -- still listening for the wake word.'
  }
}

export const showOverlayTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'show_overlay',
    description: 'Shows Kira\'s on-screen overlay again after it was hidden with hide_overlay.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    showOverlay()
    return 'Overlay shown again.'
  }
}
