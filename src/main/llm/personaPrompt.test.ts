import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './personaPrompt'

describe('buildSystemPrompt', () => {
  it('names the target language for a known code', () => {
    expect(buildSystemPrompt('pl')).toContain('Polish')
    expect(buildSystemPrompt('en')).toContain('English')
  })

  it('falls back to a generic instruction for an unknown language code', () => {
    expect(buildSystemPrompt('fr')).toContain('the same language the user just used')
  })

  it('documents the risky-tool confirmation contract', () => {
    const prompt = buildSystemPrompt('en')
    expect(prompt).toContain('confirm')
    expect(prompt).toContain('will NOT run yet')
  })

  it('explicitly instructs against servile titles', () => {
    const prompt = buildSystemPrompt('en')
    expect(prompt).toContain('Never address the user as')
    expect(prompt.toLowerCase()).not.toContain('address the user as sir') // not phrased as an instruction *to* use it
  })

  it('instructs Kira to stay in character and avoid text-only formatting', () => {
    const prompt = buildSystemPrompt('en')
    expect(prompt).toContain('Stay in character')
    expect(prompt).toContain('markdown')
  })

  it('documents the no_reply contract for trivial actions', () => {
    const prompt = buildSystemPrompt('en')
    expect(prompt).toContain('no_reply')
    expect(prompt).toContain('trivial')
  })

  it('documents the end_conversation contract with an in-character sign-off', () => {
    const prompt = buildSystemPrompt('en')
    expect(prompt).toContain('end_conversation')
    expect(prompt).toContain('sign-off')
  })

  it('documents the background-task follow-up contract', () => {
    const prompt = buildSystemPrompt('en')
    expect(prompt).toContain('running in the background')
    expect(prompt).toContain('still in progress')
  })

  it('defaults to medium wit and normal verbosity, matching the schema defaults', () => {
    const withDefaults = buildSystemPrompt('en')
    const withExplicitDefaults = buildSystemPrompt('en', { wit: 'medium', verbosity: 'normal', alwaysConfirm: false })
    expect(withDefaults).toBe(withExplicitDefaults)
  })

  it('dials wit up or down without touching verbosity', () => {
    const low = buildSystemPrompt('en', { wit: 'low' })
    expect(low).toContain('Keep wit to a minimum')
    const high = buildSystemPrompt('en', { wit: 'high' })
    expect(high).toContain('more than usual')
  })

  it('dials verbosity up or down', () => {
    const terse = buildSystemPrompt('en', { verbosity: 'terse' })
    expect(terse).toContain('as short as physically possible')
    const chatty = buildSystemPrompt('en', { verbosity: 'chatty' })
    expect(chatty).toContain('a bit more conversational')
  })

  it('drops the no_reply contract and requires every action confirmed when alwaysConfirm is true', () => {
    const prompt = buildSystemPrompt('en', { alwaysConfirm: true })
    expect(prompt).not.toContain('no_reply')
    expect(prompt).toContain('always follow up with a short spoken confirmation')
  })
})
