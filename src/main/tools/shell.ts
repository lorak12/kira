import { execFile, spawn } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Every IO-based tool that shells out goes through this module, and only
// this module -- so tests can `vi.mock('./shell')` once and exercise each
// tool's argument-building/parsing logic without touching a real process,
// the real registry, or the real filesystem.

/** Runs an inline PowerShell script and returns trimmed stdout. Throws on non-zero exit. */
export async function runPowerShell(script: string): Promise<string> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout.trim()
}

/** Runs an arbitrary command and returns trimmed stdout. Throws on non-zero exit. */
export async function runCommand(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

/** Launches a command detached (fire-and-forget) -- for opening apps/terminals we don't wait on. */
export function spawnDetached(cmd: string, args: string[], cwd?: string): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd, shell: false })
  // spawn() failures (e.g. cmd not found) surface async via 'error', not a
  // thrown exception -- an unhandled listener here would crash the main
  // process, so at minimum log it since nothing is awaiting this call.
  child.on('error', (err) => console.error(`[kira] failed to launch "${cmd}":`, err.message))
  child.unref()
}
