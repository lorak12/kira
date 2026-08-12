/**
 * Tracks tool calls that turned out to be slow enough to run in the
 * background instead of blocking the turn that started them (see
 * `BACKGROUND_THRESHOLD_MS` / the race in `index.ts`'s `runAgentStep`).
 *
 * Why this exists: a request like "look into X" (slow) followed by "open Y"
 * and "play something else" (fast, separate turns) needs the slow tool's
 * promise to keep running on its own while later turns proceed normally --
 * and needs its eventual result to make its way back into the conversation
 * even though no one is still `await`ing it. This class is the bookkeeping
 * for that: one record per in-flight/settled background call, keyed by an
 * id that's also spoken/logged so the user and the LLM can refer to it
 * ("still working on bg1").
 *
 * Deliberately scoped per session generation (see sessionGuard.ts): a task
 * started in a session that has since ended (dismissed, silence, a new wake
 * word, or the user explicitly saying they're done -- see end_conversation
 * in tools/sessionControl.ts) is dropped by `clear()` before it settles, so
 * its `onSettle` never fires and nothing tries to speak into a session
 * that's gone -- the same "abandon, don't corrupt" rule every other bit of
 * async turn state follows. `clear()` also aborts each task's controller,
 * so this doubles as the "kill my in-flight searches" mechanism -- best
 * effort, since only tools built on a signal-aware seam (http.ts's
 * fetchJson) actually stop real work early; others just get their
 * now-pointless result silently dropped, same as before.
 */

export interface BackgroundTask {
  id: string
  gen: number
  toolCallId: string
  name: string
  status: 'running' | 'done' | 'error'
  result?: string
  startedAt: number
  announced: boolean
  controller: AbortController
}

export class BackgroundTaskManager {
  private tasks = new Map<string, BackgroundTask>()
  private nextId = 1

  /** Called (if set) whenever a still-tracked task's promise settles. */
  onSettle: ((task: BackgroundTask) => void) | null = null

  /** Starts tracking `promise` under a fresh id and returns that id. */
  start(gen: number, toolCallId: string, name: string, promise: Promise<string>, controller: AbortController): string {
    const id = `bg${this.nextId++}`
    const task: BackgroundTask = {
      id,
      gen,
      toolCallId,
      name,
      status: 'running',
      startedAt: Date.now(),
      announced: false,
      controller
    }
    this.tasks.set(id, task)
    promise.then(
      (result) => this.settle(id, 'done', result),
      (err: Error) => this.settle(id, 'error', `Error: ${err.message}`)
    )
    return id
  }

  private settle(id: string, status: 'done' | 'error', result: string): void {
    const task = this.tasks.get(id)
    // Not found means the task was clear()'d (its session ended) before the
    // promise settled -- the real-world side effect already happened and
    // can't be undone, but there's nothing left to report it into.
    if (!task) return
    task.status = status
    task.result = result
    this.onSettle?.(task)
  }

  /** Tasks for `gen` still awaiting their result. */
  listRunning(gen: number): BackgroundTask[] {
    return [...this.tasks.values()].filter((t) => t.gen === gen && t.status === 'running')
  }

  /** Whether `gen` has a settled task whose result hasn't been spoken yet. */
  hasUnannounced(gen: number): boolean {
    return [...this.tasks.values()].some((t) => t.gen === gen && t.status !== 'running' && !t.announced)
  }

  /** Marks every currently-settled task for `gen` as announced. */
  markAnnounced(gen: number): void {
    for (const task of this.tasks.values()) {
      if (task.gen === gen && task.status !== 'running') task.announced = true
    }
  }

  /** Aborts and drops every task tracked for `gen` (its session is over). */
  clear(gen: number): void {
    for (const [id, task] of this.tasks) {
      if (task.gen === gen) {
        task.controller.abort()
        this.tasks.delete(id)
      }
    }
  }
}
