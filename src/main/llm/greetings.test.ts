import { describe, it, expect } from 'vitest'
import { pickGreeting } from './greetings'

describe('pickGreeting', () => {
  it('returns an English greeting for "en"', () => {
    for (let i = 0; i < 20; i++) {
      expect(typeof pickGreeting('en')).toBe('string')
      expect(pickGreeting('en').length).toBeGreaterThan(0)
    }
  })

  it('returns a Polish greeting for "pl"', () => {
    expect(pickGreeting('pl')).not.toBe('')
  })

  it('falls back to English for an unknown language code', () => {
    const result = pickGreeting('xx')
    expect(result.length).toBeGreaterThan(0)
  })

  it('never addresses the user with a formal title like "sir"', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickGreeting('en').toLowerCase()).not.toContain('sir')
    }
  })

  it('mixes in configured extra greetings for the matching language, without replacing the built-ins', () => {
    let sawExtra = false
    let sawBuiltin = false
    for (let i = 0; i < 100; i++) {
      const result = pickGreeting('en', { en: ['Systems nominal.'] })
      if (result === 'Systems nominal.') sawExtra = true
      else sawBuiltin = true
    }
    expect(sawExtra).toBe(true)
    expect(sawBuiltin).toBe(true)
  })

  it('ignores extra greetings configured for a different language', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickGreeting('en', { pl: ['Tylko po polsku.'] })).not.toBe('Tylko po polsku.')
    }
  })
})
