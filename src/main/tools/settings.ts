import { shell } from 'electron'
import { basename } from 'path'
import type { ToolDefinition } from './types'
import { configPath } from '../config/configStore'

// Kira has no settings GUI -- config is a hand-edited kira.config.json (see
// config/configStore.ts, whose zod validation already gives a clear error
// pointing at the bad field if something's wrong). This is the small,
// honest version of "settings" that's actually in scope right now: a way
// to get to that file by voice, not a config UI to edit it from.
export const openSettingsTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'open_settings',
    description: "Opens Kira's config file (kira.config.json) in the default editor for that file type.",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    const path = configPath()
    const err = await shell.openPath(path)
    if (err) return `Couldn't open the config file: ${err}`
    return `Opened ${basename(path)}. Changes need a restart to take effect.`
  }
}
