import { describe, it, expect } from 'vitest'
import { SessionGuard } from './sessionGuard'

describe('SessionGuard', () => {
  it('starts at generation 0 with nothing invalidated yet', () => {
    const guard = new SessionGuard()
    expect(guard.current()).toBe(0)
    expect(guard.isCurrent(0)).toBe(true)
  })

  it('next() advances the generation and returns the new value', () => {
    const guard = new SessionGuard()
    expect(guard.next()).toBe(1)
    expect(guard.current()).toBe(1)
  })

  it('a generation captured before next() is no longer current', () => {
    const guard = new SessionGuard()
    const gen = guard.current()
    guard.next()
    expect(guard.isCurrent(gen)).toBe(false)
  })

  it('a generation captured after next() is still current', () => {
    const guard = new SessionGuard()
    guard.next()
    const gen = guard.current()
    expect(guard.isCurrent(gen)).toBe(true)
  })

  it('models the wake-mid-turn race: an old turn stays stale even across several new sessions', () => {
    const guard = new SessionGuard()
    const oldTurnGen = guard.current() // turn starts
    guard.next() // "Kira" interrupts mid-turn
    guard.next() // and again, before the second turn finishes either
    expect(guard.isCurrent(oldTurnGen)).toBe(false)
  })
})
