import { clipboard } from 'electron'
import type { ToolDefinition } from './types'

const MAX_SPOKEN_LENGTH = 500

export const readClipboardTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'read_clipboard',
    description: "Reads the current text content of the user's clipboard.",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    const text = clipboard.readText()
    if (!text) return 'The clipboard is empty.'
    if (text.length > MAX_SPOKEN_LENGTH) {
      return `The clipboard has ${text.length} characters, starting with: ${text.slice(0, MAX_SPOKEN_LENGTH)}...`
    }
    return `Clipboard contains: ${text}`
  }
}

export const writeClipboardTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'write_clipboard',
    description: "Copies the given text to the user's clipboard.",
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to copy to the clipboard' }
      },
      required: ['text']
    }
  },
  async execute(args) {
    const text = String(args.text ?? '')
    clipboard.writeText(text)
    return 'Copied to clipboard.'
  }
}
