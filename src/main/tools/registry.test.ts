import { describe, it, expect, vi } from 'vitest'
import { createToolRegistry } from './registry'
import type { KiraConfig } from '../config/schema'

function configWith(overrides: Record<string, unknown> = {}): KiraConfig {
  return {
    projects: [],
    tools: { disabled: [] },
    assistant: { alwaysConfirm: false },
    ...overrides
  } as unknown as KiraConfig
}

describe('createToolRegistry', () => {
  it('registers every tool with a unique name', () => {
    const registry = createToolRegistry(configWith())
    const names = registry.getToolSchemas().map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeGreaterThan(20)
  })

  it('every schema has a non-empty description and required array', () => {
    const registry = createToolRegistry(configWith())
    for (const schema of registry.getToolSchemas()) {
      expect(schema.description.length).toBeGreaterThan(0)
      expect(Array.isArray(schema.parameters.required)).toBe(true)
    }
  })

  it('getTool resolves a known tool and returns undefined for an unknown one', () => {
    const registry = createToolRegistry(configWith())
    expect(registry.getTool('calculate')).toBeDefined()
    expect(registry.getTool('does_not_exist')).toBeUndefined()
  })

  it('passes config through to config-dependent tools (open_project)', () => {
    const registry = createToolRegistry(
      configWith({ projects: [{ name: 'jarvis', path: 'C:/dev/jarvis', editorCommand: 'code' }] })
    )
    const schema = registry.getToolSchemas().find((s) => s.name === 'open_project')
    expect(schema?.description).toContain('jarvis')
  })

  it('excludes tools listed in tools.disabled from both schemas and getTool', () => {
    const registry = createToolRegistry(configWith({ tools: { disabled: ['calculate', 'read_webpage'] } }))
    const names = registry.getToolSchemas().map((s) => s.name)
    expect(names).not.toContain('calculate')
    expect(names).not.toContain('read_webpage')
    expect(registry.getTool('calculate')).toBeUndefined()
    // Everything else is untouched.
    expect(names).toContain('get_weather')
  })

  it("warns (but does not throw) about an unknown/typo'd disabled tool name", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createToolRegistry(configWith({ tools: { disabled: ['calculatee'] } }))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('calculatee'))
    warnSpy.mockRestore()
  })

  it('includes no_reply by default', () => {
    const registry = createToolRegistry(configWith())
    expect(registry.getTool('no_reply')).toBeDefined()
  })

  it('omits no_reply entirely when assistant.alwaysConfirm is set', () => {
    const registry = createToolRegistry(configWith({ assistant: { alwaysConfirm: true } }))
    expect(registry.getTool('no_reply')).toBeUndefined()
    expect(registry.getToolSchemas().map((s) => s.name)).not.toContain('no_reply')
  })
})
