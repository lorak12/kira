export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolSchema {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required: string[]
  }
}

export type LlmResponse = { type: 'text'; content: string } | { type: 'tool_calls'; calls: ToolCall[] }

export interface LlmEngine {
  chat(messages: ChatMessage[], tools: ToolSchema[], signal?: AbortSignal): Promise<LlmResponse>
}
