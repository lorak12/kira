import { describe, it, expect, vi } from 'vitest'
import { spawnDetached } from './shell'
import { findBestProjectMatch, buildLaunchCommand, createOpenProjectTool, type ProjectConfig } from './openProject'
import type { KiraConfig } from '../config/schema'

vi.mock('./shell', () => ({ spawnDetached: vi.fn() }))

const PROJECTS: ProjectConfig[] = [
  { name: 'acucall', path: 'C:/dev/acucall', editorCommand: 'code' },
  { name: 'jarvis', path: 'C:/dev/jarvis', editorCommand: 'code' }
]

function configWith(projects: ProjectConfig[]): KiraConfig {
  return { projects } as unknown as KiraConfig
}

describe('findBestProjectMatch', () => {
  it('matches an exact name', () => {
    expect(findBestProjectMatch(PROJECTS, 'jarvis')?.name).toBe('jarvis')
  })

  it('matches a partial/fuzzy name', () => {
    expect(findBestProjectMatch(PROJECTS, 'acu')?.name).toBe('acucall')
  })

  it('returns null for no match', () => {
    expect(findBestProjectMatch(PROJECTS, 'nonexistent')).toBeNull()
  })
})

describe('buildLaunchCommand', () => {
  const project = PROJECTS[0]

  it('opens the editor with the project path', () => {
    expect(buildLaunchCommand(project, 'editor')).toEqual({ cmd: 'code', args: ['C:/dev/acucall'] })
  })

  it('opens a terminal at the project path', () => {
    expect(buildLaunchCommand(project, 'terminal')).toEqual({ cmd: 'wt.exe', args: ['-d', 'C:/dev/acucall'] })
  })

  it('launches claude inside a terminal at the project path', () => {
    const { cmd, args } = buildLaunchCommand(project, 'claude')
    expect(cmd).toBe('wt.exe')
    expect(args).toContain('C:/dev/acucall')
    expect(args).toContain('claude')
  })
})

describe('createOpenProjectTool', () => {
  it('describes itself as unconfigured when there are no projects', () => {
    const tool = createOpenProjectTool(configWith([]))
    expect(tool.schema.description).toContain('Not configured')
  })

  it('reports no projects configured when executed with an empty list', async () => {
    const tool = createOpenProjectTool(configWith([]))
    const result = await tool.execute({ projectName: 'jarvis' })
    expect(result).toContain('No dev projects are configured')
    expect(spawnDetached).not.toHaveBeenCalled()
  })

  it('opens the matched project in the editor by default', async () => {
    const tool = createOpenProjectTool(configWith(PROJECTS))
    const result = await tool.execute({ projectName: 'jarvis' })
    expect(spawnDetached).toHaveBeenCalledWith('code', ['C:/dev/jarvis'], 'C:/dev/jarvis')
    expect(result).toBe('Opened jarvis.')
  })

  it('launches claude when asked', async () => {
    const tool = createOpenProjectTool(configWith(PROJECTS))
    const result = await tool.execute({ projectName: 'acucall', action: 'claude' })
    expect(result).toBe('Launched Claude Code in acucall.')
  })

  it('reports no match for an unknown project name', async () => {
    const tool = createOpenProjectTool(configWith(PROJECTS))
    const result = await tool.execute({ projectName: 'nonexistent' })
    expect(result).toContain('No configured project matches')
    expect(spawnDetached).not.toHaveBeenCalled()
  })

  it('reports the project path with action "path" without launching anything', async () => {
    const tool = createOpenProjectTool(configWith(PROJECTS))
    const result = await tool.execute({ projectName: 'jarvis', action: 'path' })
    expect(result).toBe('jarvis is at C:/dev/jarvis')
    expect(spawnDetached).not.toHaveBeenCalled()
  })
})
