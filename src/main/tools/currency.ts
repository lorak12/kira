import type { ToolDefinition } from './types'
import { fetchJson } from './http'

// Frankfurter: free, no API key, ECB reference rates.
const BASE_URL = 'https://api.frankfurter.dev/v1/latest'

export class CurrencyError extends Error {}

interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

export async function fetchConversion(amount: number, from: string, to: string, signal?: AbortSignal): Promise<number> {
  const url = `${BASE_URL}?amount=${amount}&from=${encodeURIComponent(from.toUpperCase())}&to=${encodeURIComponent(to.toUpperCase())}`
  const data = await fetchJson<FrankfurterResponse>(url, signal)
  const rate = data.rates[to.toUpperCase()]
  if (rate === undefined) throw new CurrencyError(`Unsupported currency code "${to}".`)
  return rate
}

export const currencyConvertTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'convert_currency',
    description: 'Converts an amount from one currency to another using current exchange rates (ISO 4217 codes, e.g. USD, EUR, PLN).',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The amount to convert' },
        from: { type: 'string', description: 'Source currency code, e.g. "USD"' },
        to: { type: 'string', description: 'Target currency code, e.g. "EUR"' }
      },
      required: ['amount', 'from', 'to']
    }
  },
  async execute(args, signal) {
    const amount = Number(args.amount)
    const from = String(args.from ?? '')
    const to = String(args.to ?? '')
    if (!Number.isFinite(amount)) return `"${args.amount}" is not a valid number.`
    try {
      const converted = await fetchConversion(amount, from, to, signal)
      const rounded = Math.round(converted * 100) / 100
      return `${amount} ${from.toUpperCase()} = ${rounded} ${to.toUpperCase()}.`
    } catch (err) {
      return `Couldn't convert currency: ${(err as Error).message}`
    }
  }
}
