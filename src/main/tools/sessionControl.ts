import type { ToolDefinition } from './types'

// These two tools don't touch the OS -- they're how the LLM tells index.ts's
// runAgentStep something about how to end *this turn/conversation*, rather
// than something to do in the world. Both names are special-cased in the
// tool-call loop before the generic executor runs, so `execute()` here is
// never actually called in practice; it's kept so the interface stays
// honest and a stray direct call doesn't crash.

export const noReplyTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'no_reply',
    description:
      'Call this INSTEAD of a spoken reply when the action you just took is trivial, reversible, and low-stakes (skip/pause a song, change volume, mute, hide/show the overlay, and similar) and saying something out loud would just be noise -- especially if you have already been going back and forth with the user and constant chatter would be annoying. Never call this if the user asked a question, needs information, something unexpected happened, or a risky action is awaiting confirmation -- those always need a spoken reply.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    return 'Acknowledged -- staying silent.'
  }
}

export const endConversationTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'end_conversation',
    description:
      'Call this when the user is clearly done talking to you for now (e.g. "thanks, that\'s all", "we\'re done here", "bye", "nothing else") so the session ends. This also cancels any of your own background tasks (searches, etc.) still running for this conversation -- they will not be reported. Call this tool, then give a short, warm, in-character sign-off as your very next reply -- never call it without also saying goodbye, and don\'t call any other tool after it.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    return 'Acknowledged -- ending the session.'
  }
}
