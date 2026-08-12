import { SidecarClient } from '../wake-word/sidecarClient'
import type { KiraConfig } from '../config/schema'
import type { KiraState } from '../../shared/ipc'

/**
 * Drives the exact same event surface the real audio sidecar produces
 * (wake/mute/speechEnd/transcript) on a scripted timeline instead of a live
 * mic + wake-word model + Python process -- so a demo scenario can exercise
 * the *real* pipeline in index.ts (real LLM calls, real tool execution,
 * real TTS, real overlay/activity-panel IPC) without anyone needing to say
 * anything out loud. Subclasses SidecarClient (rather than reimplementing
 * its interface) purely so index.ts doesn't need any conditional typing --
 * a FakeSidecarClient IS a SidecarClient, just with start()/stop()/abort()/
 * startListening() overridden to not touch a real process or socket.
 *
 * Only used when KIRA_SIM=1 (see index.ts).
 */
export class FakeSidecarClient extends SidecarClient {
  private simStopped = false
  private stateWaiters: Array<{ state: KiraState; resolve: () => void }> = []
  private readonly scenario: (sidecar: FakeSidecarClient) => Promise<void>

  constructor(config: KiraConfig, scenario: (sidecar: FakeSidecarClient) => Promise<void>) {
    super(config)
    this.scenario = scenario
  }

  override start(): void {
    console.log('[kira-sim] fake sidecar "started" -- no mic, no wake-word model, no Python process')
    void this.scenario(this).catch((err) => console.error('[kira-sim] scenario crashed:', (err as Error).stack ?? err))
  }

  override stop(): void {
    this.simStopped = true
  }

  override abort(): void {
    console.log('[kira-sim] abort() called (mute keyword or hotkey)')
  }

  override startListening(): void {
    console.log('[kira-sim] startListening() -- ready for the next scripted line')
  }

  /**
   * index.ts's setState() calls this on every real state transition (only
   * when KIRA_SIM=1) so the scenario can time an interruption off an actual
   * 'speaking' moment instead of guessing at LLM/TTS latency.
   */
  notifyState(state: KiraState): void {
    this.stateWaiters = this.stateWaiters.filter((w) => {
      if (w.state !== state) return true
      w.resolve()
      return false
    })
  }

  /**
   * Resolves the next time `state` is reached, or after `timeoutMs` --
   * whichever comes first, so a step that expected speech (e.g. a no_reply
   * turn stayed silent) can't hang the whole scenario forever.
   */
  waitForState(state: KiraState, timeoutMs = 6000): Promise<void> {
    if (this.simStopped) return Promise.resolve()
    return Promise.race([
      new Promise<void>((resolve) => this.stateWaiters.push({ state, resolve })),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])
  }
}
