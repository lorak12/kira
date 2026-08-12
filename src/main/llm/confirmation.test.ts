import { describe, it, expect } from 'vitest'
import { isAffirmative, isNegative } from './confirmation'

describe('isAffirmative', () => {
  it('recognizes common English affirmatives', () => {
    for (const phrase of ['yes', 'Yeah', 'sure, do it', 'go ahead', 'confirmed', 'okay']) {
      expect(isAffirmative(phrase)).toBe(true)
    }
  })

  it('recognizes common Polish affirmatives', () => {
    for (const phrase of ['tak', 'zrób to', 'potwierdzam']) {
      expect(isAffirmative(phrase)).toBe(true)
    }
  })

  it('does not treat unrelated speech as affirmative', () => {
    expect(isAffirmative('what time is it')).toBe(false)
    expect(isAffirmative('no thanks')).toBe(false)
  })
})

describe('isNegative', () => {
  it('recognizes common English negatives', () => {
    for (const phrase of ['no', 'nope', "don't", 'cancel that', 'stop']) {
      expect(isNegative(phrase)).toBe(true)
    }
  })

  it('recognizes common Polish negatives', () => {
    for (const phrase of ['nie', 'anuluj', 'przestań']) {
      expect(isNegative(phrase)).toBe(true)
    }
  })

  it('does not treat unrelated speech as negative', () => {
    expect(isNegative('yes please')).toBe(false)
  })
})
