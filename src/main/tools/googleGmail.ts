import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { googleFetchJson } from '../google/http'
import { runGoogleTool } from './googleErrors'

const GMAIL_BASE = 'https://www.googleapis.com/gmail/v1/users/me/messages'
const MAX_SEARCH_RESULTS = 5

interface MessageListItem {
  id: string
}

interface MessageList {
  messages?: MessageListItem[]
}

interface MessageHeader {
  name: string
  value: string
}

interface MessagePart {
  mimeType?: string
  body?: { data?: string }
  parts?: MessagePart[]
}

interface Message {
  id: string
  snippet?: string
  payload?: { headers?: MessageHeader[]; mimeType?: string; body?: { data?: string }; parts?: MessagePart[] }
}

function header(message: Message, name: string): string {
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '(unknown)'
}

/** Walks a MIME payload's part tree for the first text/plain body, base64url-decoded. Pure/testable. */
export function extractPlainTextBody(payload: Message['payload']): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8')
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf-8')
    }
  }
  for (const part of payload.parts ?? []) {
    const nested = extractPlainTextBody(part)
    if (nested) return nested
  }
  return ''
}

/** Builds a base64url-encoded RFC 2822 message for the Gmail send endpoint. Pure/testable. */
export function buildRawEmail(to: string, subject: string, body: string): string {
  const message = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', body].join('\r\n')
  return Buffer.from(message, 'utf-8').toString('base64url')
}

export function createGoogleGmailTools(auth: GoogleAuthManager): ToolDefinition[] {
  const searchEmailsTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'search_emails',
      description: "Searches the user's Gmail, using Gmail's search syntax (e.g. \"from:someone subject:invoice is:unread\"), and returns matching subjects/senders/snippets.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query' },
          maxResults: { type: 'number', description: `Max results (default ${MAX_SEARCH_RESULTS})` }
        },
        required: ['query']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const maxResults = Math.min(
          Number.isFinite(Number(args.maxResults)) ? Number(args.maxResults) : MAX_SEARCH_RESULTS,
          MAX_SEARCH_RESULTS
        )
        const list = await googleFetchJson<MessageList>(
          `${GMAIL_BASE}?q=${encodeURIComponent(String(args.query ?? ''))}&maxResults=${maxResults}`,
          auth,
          undefined,
          signal
        )
        const ids = list.messages ?? []
        if (!ids.length) return 'No matching emails found.'

        const messages = await Promise.all(
          ids.map((m) => googleFetchJson<Message>(`${GMAIL_BASE}/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, auth, undefined, signal))
        )
        const lines = messages.map((m) => `"${header(m, 'Subject')}" from ${header(m, 'From')} -- ${m.snippet ?? ''}`)
        return `Found ${lines.length} email(s): ${lines.join('; ')}.`
      })
    }
  }

  const getEmailTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'get_email',
      description: 'Reads the full content of one email by its message ID (from search_emails).',
      parameters: {
        type: 'object',
        properties: {
          messageId: { type: 'string', description: 'The Gmail message ID' }
        },
        required: ['messageId']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const message = await googleFetchJson<Message>(`${GMAIL_BASE}/${String(args.messageId ?? '')}?format=full`, auth, undefined, signal)
        const body = extractPlainTextBody(message.payload) || message.snippet || '(no readable content)'
        return `From ${header(message, 'From')}, subject "${header(message, 'Subject')}": ${body}`
      })
    }
  }

  const sendEmailTool: ToolDefinition = {
    // Sending on the user's behalf to a third party is the least reversible
    // action in this whole set of Google tools -- always confirm.
    risky: true,
    schema: {
      name: 'send_email',
      description: "Sends an email from the user's Gmail account.",
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Plain-text email body' }
        },
        required: ['to', 'subject', 'body']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const raw = buildRawEmail(String(args.to ?? ''), String(args.subject ?? ''), String(args.body ?? ''))
        await googleFetchJson<Message>(
          `${GMAIL_BASE}/send`,
          auth,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) },
          signal
        )
        return `Email sent to ${args.to}.`
      })
    }
  }

  return [searchEmailsTool, getEmailTool, sendEmailTool]
}
