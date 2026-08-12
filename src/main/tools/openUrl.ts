import { shell } from 'electron'
import type { ToolDefinition } from './types'

export const openUrlTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'open_url',
    description:
      'Opens a URL in the default web browser. Use your own knowledge to fill in the actual URL for known sites (e.g. "twitch" -> https://twitch.tv, "netflix" -> https://netflix.com) rather than asking the user for it.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to open, including https://' }
      },
      required: ['url']
    }
  },
  async execute(args) {
    const url = String(args.url ?? '')
    if (!/^https?:\/\//i.test(url)) {
      return `"${url}" is not a valid URL.`
    }
    await shell.openExternal(url)
    return `Opened ${url}.`
  }
}

export const webSearchTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'web_search',
    description:
      'Opens a web search in the default browser for a query. Use this when the user wants to look something up and there is no single obvious site to open directly.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  },
  async execute(args) {
    const query = String(args.query ?? '')
    await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`)
    return `Searched the web for "${query}".`
  }
}
