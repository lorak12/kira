import type { ToolDefinition } from './types'
import { runCommand } from './shell'

export type PowerAction = 'lock' | 'sleep' | 'shutdown' | 'restart'

// Shutdown/restart use a short grace period rather than /t 0 so a
// misheard command is cancellable (`shutdown /a`) instead of instant.
const GRACE_SECONDS = 8

export interface PowerCommand {
  cmd: string
  args: string[]
}

/** Maps an action to the OS command that performs it. Pure/testable. */
export function buildPowerCommand(action: PowerAction): PowerCommand {
  switch (action) {
    case 'lock':
      return { cmd: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] }
    case 'sleep':
      return { cmd: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'] }
    case 'shutdown':
      return { cmd: 'shutdown.exe', args: ['/s', '/t', String(GRACE_SECONDS)] }
    case 'restart':
      return { cmd: 'shutdown.exe', args: ['/r', '/t', String(GRACE_SECONDS)] }
  }
}

const CONFIRM_MESSAGE: Record<PowerAction, string> = {
  lock: 'Locking your screen.',
  sleep: 'Putting the computer to sleep.',
  shutdown: `Shutting down in ${GRACE_SECONDS} seconds. Say "cancel that" to stop it.`,
  restart: `Restarting in ${GRACE_SECONDS} seconds. Say "cancel that" to stop it.`
}

async function runPowerAction(action: PowerAction): Promise<string> {
  const { cmd, args } = buildPowerCommand(action)
  await runCommand(cmd, args)
  return CONFIRM_MESSAGE[action]
}

// Locking is trivially reversible (type your password) so it's safe to run
// immediately, unlike the other power actions below.
export const lockScreenTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'lock_screen',
    description:
      "Locks the user's Windows screen immediately, requiring a password to get back in. Only for an explicit request to lock/secure the PC -- NOT for hiding Kira's own overlay (use hide_overlay for that).",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    try {
      return await runPowerAction('lock')
    } catch (err) {
      return `Couldn't lock the screen: ${(err as Error).message}`
    }
  }
}

export const systemPowerTool: ToolDefinition = {
  // Sleep/shutdown/restart interrupt whatever the user is doing, and
  // shutdown/restart are slow to undo -- the agent loop requires a spoken
  // confirmation before running this tool. See index.ts's confirmation flow.
  risky: true,
  schema: {
    name: 'system_power',
    description:
      "Puts the computer to sleep, shuts it down, or restarts it. Disruptive -- always requires the user to confirm before it actually runs.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The power action to perform',
          enum: ['sleep', 'shutdown', 'restart']
        }
      },
      required: ['action']
    }
  },
  async execute(args) {
    const action = String(args.action ?? '') as PowerAction
    if (action === 'lock' || !(action in CONFIRM_MESSAGE)) return `Unknown power action "${action}".`
    try {
      return await runPowerAction(action)
    } catch (err) {
      return `Couldn't do that: ${(err as Error).message}`
    }
  }
}

export const cancelShutdownTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'cancel_shutdown',
    description: 'Cancels a pending shutdown or restart that was scheduled with a grace period.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    try {
      await runCommand('shutdown.exe', ['/a'])
      return 'Cancelled the pending shutdown/restart.'
    } catch {
      return 'There was no pending shutdown or restart to cancel.'
    }
  }
}
