import { describe, it, expect, vi } from 'vitest'
import { fetchJson } from './http'
import { fetchConversion, CurrencyError, currencyConvertTool } from './currency'

vi.mock('./http', () => ({ fetchJson: vi.fn() }))

describe('fetchConversion', () => {
  it('returns the converted amount for a supported currency', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      amount: 100,
      base: 'USD',
      date: '2026-08-11',
      rates: { EUR: 91.2 }
    })
    const result = await fetchConversion(100, 'usd', 'eur')
    expect(result).toBe(91.2)
  })

  it('throws CurrencyError for an unsupported target currency', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ amount: 1, base: 'USD', date: '2026-08-11', rates: {} })
    await expect(fetchConversion(1, 'USD', 'ZZZ')).rejects.toThrow(CurrencyError)
  })
})

describe('currencyConvertTool.execute', () => {
  it('formats the result with uppercased codes', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      amount: 50,
      base: 'USD',
      date: '2026-08-11',
      rates: { PLN: 199.955 }
    })
    const result = await currencyConvertTool.execute({ amount: 50, from: 'usd', to: 'pln' })
    expect(result).toBe('50 USD = 199.96 PLN.')
  })

  it('rejects a non-numeric amount without throwing', async () => {
    const result = await currencyConvertTool.execute({ amount: 'abc', from: 'USD', to: 'EUR' })
    expect(result).toContain('not a valid number')
  })

  it('returns a friendly error on failure', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('network down'))
    const result = await currencyConvertTool.execute({ amount: 1, from: 'USD', to: 'EUR' })
    expect(result).toContain("Couldn't convert currency")
  })
})
