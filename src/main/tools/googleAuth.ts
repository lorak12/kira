import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { runGoogleTool } from './googleErrors'

export function createLinkGoogleAccountTool(auth: GoogleAuthManager): ToolDefinition {
  return {
    risky: false,
    schema: {
      name: 'link_google_account',
      description:
        'Starts the Google sign-in flow (Calendar/Gmail/Drive/Docs/Sheets/Slides, depending on what\'s enabled) by opening a browser consent screen. Use when the user asks to connect/link their Google account, or a Google tool reports it isn\'t linked yet.',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    async execute() {
      return runGoogleTool(() => auth.link())
    }
  }
}

export function createUnlinkGoogleAccountTool(auth: GoogleAuthManager): ToolDefinition {
  return {
    // Kills access to every Google tool at once -- disruptive enough to
    // warrant confirmation even though it's easy to re-link.
    risky: true,
    schema: {
      name: 'unlink_google_account',
      description: "Removes the stored Google account link, disabling every Google tool (Calendar, Gmail, Drive, Docs, Sheets, Slides) until relinked.",
      parameters: { type: 'object', properties: {}, required: [] }
    },
    async execute() {
      return runGoogleTool(async () => {
        await auth.unlink()
        return 'Google account unlinked.'
      })
    }
  }
}
