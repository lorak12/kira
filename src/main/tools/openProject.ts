import type { KiraConfig } from '../config/schema'
import type { ToolDefinition } from './types'
import { scoreMatch } from './openApp'
import { spawnDetached } from './shell'

export type ProjectAction = 'editor' | 'terminal' | 'claude' | 'path'
// 'path' never reaches buildLaunchCommand -- it's answered directly in
// execute() below, without spawning anything.
type LaunchAction = Exclude<ProjectAction, 'path'>

export interface ProjectConfig {
  name: string
  path: string
  editorCommand: string
}

/** Fuzzy-matches a project name against configured projects. Pure/testable. */
export function findBestProjectMatch(projects: ProjectConfig[], query: string): ProjectConfig | null {
  let best: { project: ProjectConfig; score: number } | null = null
  for (const project of projects) {
    const score = scoreMatch(query, project.name)
    if (score > 0 && (!best || score > best.score)) best = { project, score }
  }
  return best?.project ?? null
}

/** Builds the (cmd, args) to launch for a given project + action. Pure/testable. */
export function buildLaunchCommand(project: ProjectConfig, action: LaunchAction): { cmd: string; args: string[] } {
  switch (action) {
    case 'editor':
      return { cmd: project.editorCommand, args: [project.path] }
    case 'terminal':
      return { cmd: 'wt.exe', args: ['-d', project.path] }
    case 'claude':
      return { cmd: 'wt.exe', args: ['-d', project.path, 'powershell', '-NoExit', '-Command', 'claude'] }
  }
}

const ACTION_VERB: Record<LaunchAction, string> = {
  editor: 'Opened',
  terminal: 'Opened a terminal in',
  claude: 'Launched Claude Code in'
}

export function createOpenProjectTool(config: KiraConfig): ToolDefinition {
  const projects = config.projects as ProjectConfig[]

  return {
    risky: false,
    schema: {
      name: 'open_project',
      description:
        projects.length === 0
          ? 'Not configured -- no dev projects are set up in kira.config.json yet.'
          : `Opens one of the user's configured dev projects (${projects.map((p) => p.name).join(', ')}) in VS Code, a terminal, or with Claude Code running -- or, with action "path", just tells you its filesystem path without opening anything (use this first if you need the real path to pass to read_file/find_files, since a project name alone isn't a path).`,
      parameters: {
        type: 'object',
        properties: {
          projectName: { type: 'string', description: 'Name of the project' },
          action: {
            type: 'string',
            description:
              'How to open it: "editor" (VS Code, default), "terminal", "claude" (terminal running Claude Code), or "path" (just report its filesystem path, no side effect)',
            enum: ['editor', 'terminal', 'claude', 'path']
          }
        },
        required: ['projectName']
      }
    },
    async execute(args) {
      if (!projects.length) {
        return "No dev projects are configured yet -- add some to kira.config.json's projects list."
      }
      const projectName = String(args.projectName ?? '')
      const action = (args.action ? String(args.action) : 'editor') as ProjectAction
      const project = findBestProjectMatch(projects, projectName)
      if (!project) return `No configured project matches "${projectName}".`

      if (action === 'path') return `${project.name} is at ${project.path}`

      if (!(action in ACTION_VERB)) return `Unknown action "${action}".`
      try {
        const { cmd, args: cmdArgs } = buildLaunchCommand(project, action)
        spawnDetached(cmd, cmdArgs, project.path)
        return `${ACTION_VERB[action]} ${project.name}.`
      } catch (err) {
        return `Couldn't open ${project.name}: ${(err as Error).message}`
      }
    }
  }
}
