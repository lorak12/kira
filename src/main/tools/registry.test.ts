import { describe, it, expect, vi } from 'vitest'
import { createToolRegistry } from './registry'
import type { KiraConfig } from '../config/schema'

function configWith(overrides: Record<string, unknown> = {}): KiraConfig {
  return {
    projects: [],
    tools: { disabled: [] },
    assistant: { alwaysConfirm: false },
    google: { enabledServices: [] },
    maps: {},
    memory: { enabled: true },
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

  it('always registers link_google_account/unlink_google_account, regardless of enabledServices', () => {
    const registry = createToolRegistry(configWith())
    expect(registry.getTool('link_google_account')).toBeDefined()
    expect(registry.getTool('unlink_google_account')).toBeDefined()
  })

  it('omits calendar tools when google.enabledServices does not include calendar', () => {
    const registry = createToolRegistry(configWith({ google: { enabledServices: [] } }))
    expect(registry.getTool('list_calendar_events')).toBeUndefined()
    expect(registry.getTool('create_calendar_event')).toBeUndefined()
  })

  it('registers calendar tools when google.enabledServices includes calendar', () => {
    const registry = createToolRegistry(configWith({ google: { enabledServices: ['calendar'] } }))
    expect(registry.getTool('list_calendar_events')).toBeDefined()
    expect(registry.getTool('create_calendar_event')).toBeDefined()
    expect(registry.getTool('update_calendar_event')).toBeDefined()
    expect(registry.getTool('delete_calendar_event')).toBeDefined()
  })

  it('gates each remaining Google service tool set on its own enabledServices entry', () => {
    const registry = createToolRegistry(
      configWith({ google: { enabledServices: ['gmail', 'drive', 'docs', 'sheets', 'slides'] } })
    )
    for (const name of ['search_emails', 'get_email', 'send_email']) expect(registry.getTool(name)).toBeDefined()
    for (const name of ['search_drive_files', 'get_drive_file_link']) expect(registry.getTool(name)).toBeDefined()
    for (const name of ['read_google_doc', 'create_google_doc']) expect(registry.getTool(name)).toBeDefined()
    for (const name of ['read_sheet_range', 'append_sheet_row']) expect(registry.getTool(name)).toBeDefined()
    for (const name of ['read_slides_outline', 'create_slide']) expect(registry.getTool(name)).toBeDefined()
    // calendar wasn't enabled -- its tools should be absent even though other services are on.
    expect(registry.getTool('list_calendar_events')).toBeUndefined()
  })

  it('omits get_directions when maps.apiKey is unset, registers it when set', () => {
    expect(createToolRegistry(configWith({ maps: {} })).getTool('get_directions')).toBeUndefined()
    expect(createToolRegistry(configWith({ maps: { apiKey: 'key' } })).getTool('get_directions')).toBeDefined()
  })

  it('registers remember_fact by default, omits it when memory.enabled is false', () => {
    expect(createToolRegistry(configWith()).getTool('remember_fact')).toBeDefined()
    expect(createToolRegistry(configWith({ memory: { enabled: false } })).getTool('remember_fact')).toBeUndefined()
  })
})
