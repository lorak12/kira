import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import type { KiraConfig } from '../config/schema'
import type { ChatMessage, LlmEngine, LlmResponse, ToolSchema } from './LlmEngine'

function toOpenAiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId! }
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
        }))
      }
    }
    return { role: m.role, content: m.content }
  })
}

function toOpenAiTools(tools: ToolSchema[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }))
}

export class OpenRouterEngine implements LlmEngine {
  private client: OpenAI
  private model: string
  private fallbackModel: string

  constructor(config: KiraConfig) {
    this.client = new OpenAI({
      apiKey: config.llm.openRouterApiKey,
      baseURL: 'https://openrouter.ai/api/v1'
    })
    this.model = config.llm.model
    this.fallbackModel = config.llm.fallbackModel
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[], signal?: AbortSignal): Promise<LlmResponse> {
    try {
      return await this.complete(this.model, messages, tools, signal)
    } catch (err) {
      console.error(`[kira] LLM call failed on ${this.model}, falling back to ${this.fallbackModel}:`, err)
      return await this.complete(this.fallbackModel, messages, tools, signal)
    }
  }

  private async complete(
    model: string,
    messages: ChatMessage[],
    tools: ToolSchema[],
    signal?: AbortSignal
  ): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create(
      {
        model,
        messages: toOpenAiMessages(messages),
        tools: tools.length ? toOpenAiTools(tools) : undefined
      },
      { signal }
    )
    const message = response.choices[0]?.message
    if (!message) throw new Error(`Empty completion from ${model}`)

    if (message.tool_calls?.length) {
      return {
        type: 'tool_calls',
        calls: message.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: safeParseArgs(tc.function.arguments)
        }))
      }
    }

    if (!message.content) throw new Error(`Empty completion from ${model}`)
    return { type: 'text', content: message.content.trim() }
  }
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}
