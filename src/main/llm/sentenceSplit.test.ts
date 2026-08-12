import { describe, it, expect } from 'vitest'
import { splitForStreaming } from './sentenceSplit'

describe('splitForStreaming', () => {
  it('keeps a short reply as a single chunk even with multiple sentences', () => {
    expect(splitForStreaming('Done. Next?')).toEqual(['Done. Next?'])
  })

  it('keeps a short single-sentence reply as one chunk', () => {
    expect(splitForStreaming("Opened Spotify.")).toEqual(['Opened Spotify.'])
  })

  it('splits a long multi-sentence reply into per-sentence chunks', () => {
    const long =
      'This is technically feasible and most of the logic ports over cleanly. The main risk is scope creep before shipping a first version. I would start small and validate the idea.'
    const chunks = splitForStreaming(long)
    expect(chunks.length).toBe(3)
    expect(chunks[0]).toBe('This is technically feasible and most of the logic ports over cleanly.')
    expect(chunks[2]).toBe('I would start small and validate the idea.')
  })

  it('does not split a single long sentence with no sentence boundary', () => {
    const long = 'a'.repeat(120)
    expect(splitForStreaming(long)).toEqual([long])
  })

  it('handles empty/whitespace-only input without crashing', () => {
    expect(splitForStreaming('')).toEqual([''])
    expect(splitForStreaming('   ')).toEqual([''])
  })

  it('trims each resulting chunk', () => {
    const long = 'First sentence here for length.   Second sentence also has enough length in it.'
    const chunks = splitForStreaming(long)
    for (const chunk of chunks) {
      expect(chunk).toBe(chunk.trim())
    }
  })
})
