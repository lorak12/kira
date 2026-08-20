import { describe, it, expect, vi } from 'vitest'
import { fetchJson } from './http'
import { createDirectionsTool, formatDirections } from './maps'
import type { KiraConfig } from '../config/schema'

vi.mock('./http', () => ({ fetchJson: vi.fn() }))

function configWith(apiKey?: string): KiraConfig {
  return { maps: { apiKey } } as unknown as KiraConfig
}

describe('formatDirections', () => {
  it('formats a driving route', () => {
    const result = formatDirections(
      { status: 'OK', routes: [{ summary: 'I-95', legs: [{ duration: { text: '22 mins' }, distance: { text: '14 km' } }] }] },
      'driving'
    )
    expect(result).toBe('About 22 mins (14 km) driving via I-95.')
  })

  it('formats a transit route without a summary', () => {
    const result = formatDirections({ status: 'OK', routes: [{ legs: [{ duration: { text: '40 mins' }, distance: { text: '10 km' } }] }] }, 'transit')
    expect(result).toBe('About 40 mins (10 km) by public transport.')
  })

  it('reports no route found', () => {
    expect(formatDirections({ status: 'ZERO_RESULTS' }, 'walking')).toContain("Couldn't find a walking route")
  })

  it('reports a Google-provided error message', () => {
    expect(formatDirections({ status: 'REQUEST_DENIED', error_message: 'The provided API key is invalid.' }, 'driving')).toContain(
      'invalid'
    )
  })
})

describe('get_directions tool', () => {
  it('is not risky', () => {
    expect(createDirectionsTool(configWith('key')).risky).toBe(false)
  })

  it('reports when maps.apiKey is unset, without calling fetchJson', async () => {
    const tool = createDirectionsTool(configWith(undefined))
    const result = await tool.execute({ origin: 'A', destination: 'B' })
    expect(result).toContain("isn't configured")
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('defaults to driving mode when none is given', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      status: 'OK',
      routes: [{ legs: [{ duration: { text: '10 mins' }, distance: { text: '5 km' } }] }]
    })
    const result = await createDirectionsTool(configWith('key')).execute({ origin: 'A', destination: 'B' })
    expect(result).toContain('driving')
    expect(vi.mocked(fetchJson).mock.calls[0][0]).toContain('mode=driving')
  })

  it('honors an explicit mode', async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({
      status: 'OK',
      routes: [{ legs: [{ duration: { text: '30 mins' }, distance: { text: '3 km' } }] }]
    })
    const result = await createDirectionsTool(configWith('key')).execute({ origin: 'A', destination: 'B', mode: 'bicycling' })
    expect(result).toContain('cycling')
  })

  it('returns a friendly error string on a network failure rather than throwing', async () => {
    vi.mocked(fetchJson).mockRejectedValueOnce(new Error('timeout'))
    const result = await createDirectionsTool(configWith('key')).execute({ origin: 'A', destination: 'B' })
    expect(result).toContain('timeout')
  })
})
