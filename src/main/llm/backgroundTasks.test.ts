import { describe, it, expect, vi } from 'vitest'
import { BackgroundTaskManager } from './backgroundTasks'

// Lets a test control exactly when a "tool" promise resolves/rejects,
// mirroring how a real tool.execute() call would race against the
// background threshold in index.ts's runAgentStep.
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Every start() call in index.ts is paired with an AbortController it made
// for that specific call -- tests do the same so clear()'s abort behavior
// can be observed.
function startTask(mgr: BackgroundTaskManager, gen: number, toolCallId: string, name: string, promise: Promise<string>) {
  const controller = new AbortController()
  const id = mgr.start(gen, toolCallId, name, promise, controller)
  return { id, controller }
}

describe('BackgroundTaskManager', () => {
  it('tracks a started task as running with a fresh id', () => {
    const mgr = new BackgroundTaskManager()
    const { promise } = deferred<string>()
    const { id } = startTask(mgr, 1, 'call-1', 'web_search', promise)
    expect(id).toBe('bg1')
    expect(mgr.listRunning(1)).toEqual([expect.objectContaining({ id: 'bg1', status: 'running', name: 'web_search' })])
  })

  it('hands out increasing ids across multiple concurrent tasks', () => {
    const mgr = new BackgroundTaskManager()
    const a = startTask(mgr, 1, 'call-1', 'web_search', deferred<string>().promise)
    const b = startTask(mgr, 1, 'call-2', 'find_files', deferred<string>().promise)
    expect(a.id).toBe('bg1')
    expect(b.id).toBe('bg2')
    expect(mgr.listRunning(1)).toHaveLength(2)
  })

  it('moves a task to done and fires onSettle when its promise resolves', async () => {
    const mgr = new BackgroundTaskManager()
    const onSettle = vi.fn()
    mgr.onSettle = onSettle
    const { promise, resolve } = deferred<string>()
    startTask(mgr, 1, 'call-1', 'web_search', promise)

    resolve('Found three matching repos.')
    await promise
    // Let the .then() microtask queued inside start() flush.
    await Promise.resolve()

    expect(mgr.listRunning(1)).toEqual([])
    expect(onSettle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bg1', status: 'done', result: 'Found three matching repos.' })
    )
  })

  it('moves a task to error with a formatted message when its promise rejects', async () => {
    const mgr = new BackgroundTaskManager()
    const onSettle = vi.fn()
    mgr.onSettle = onSettle
    const { promise, reject } = deferred<string>()
    startTask(mgr, 1, 'call-1', 'web_search', promise)

    reject(new Error('network timeout'))
    await promise.catch(() => {})
    await Promise.resolve()

    expect(onSettle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bg1', status: 'error', result: 'Error: network timeout' })
    )
  })

  it('hasUnannounced is false while running, true once settled, false again after markAnnounced', async () => {
    const mgr = new BackgroundTaskManager()
    const { promise, resolve } = deferred<string>()
    startTask(mgr, 1, 'call-1', 'web_search', promise)

    expect(mgr.hasUnannounced(1)).toBe(false)

    resolve('done')
    await promise
    await Promise.resolve()
    expect(mgr.hasUnannounced(1)).toBe(true)

    mgr.markAnnounced(1)
    expect(mgr.hasUnannounced(1)).toBe(false)
  })

  it('scopes running/announced queries to a single session generation', async () => {
    const mgr = new BackgroundTaskManager()
    const genA = deferred<string>()
    const genB = deferred<string>()
    startTask(mgr, 1, 'call-1', 'web_search', genA.promise)
    startTask(mgr, 2, 'call-2', 'web_search', genB.promise)

    genB.resolve('done')
    await genB.promise
    await Promise.resolve()

    expect(mgr.listRunning(1)).toHaveLength(1)
    expect(mgr.listRunning(2)).toHaveLength(0)
    expect(mgr.hasUnannounced(1)).toBe(false)
    expect(mgr.hasUnannounced(2)).toBe(true)
  })

  it('clear() drops tasks for a superseded generation so a late settle is silently discarded', async () => {
    const mgr = new BackgroundTaskManager()
    const onSettle = vi.fn()
    mgr.onSettle = onSettle
    const { promise, resolve } = deferred<string>()
    startTask(mgr, 1, 'call-1', 'web_search', promise)

    // Session ends (dismiss/silence/new wake/end_conversation) before the
    // tool finishes.
    mgr.clear(1)

    resolve('too late, nobody is listening')
    await promise
    await Promise.resolve()

    expect(onSettle).not.toHaveBeenCalled()
    expect(mgr.listRunning(1)).toEqual([])
  })

  it('clear() only affects the given generation, leaving others tracked', () => {
    const mgr = new BackgroundTaskManager()
    startTask(mgr, 1, 'call-1', 'web_search', deferred<string>().promise)
    startTask(mgr, 2, 'call-2', 'find_files', deferred<string>().promise)

    mgr.clear(1)

    expect(mgr.listRunning(1)).toEqual([])
    expect(mgr.listRunning(2)).toHaveLength(1)
  })

  it('clear() aborts each running task\'s controller -- the "kill my searches" mechanism', () => {
    const mgr = new BackgroundTaskManager()
    const { promise } = deferred<string>()
    const { controller } = startTask(mgr, 1, 'call-1', 'web_search', promise)
    expect(controller.signal.aborted).toBe(false)

    mgr.clear(1)

    expect(controller.signal.aborted).toBe(true)
  })

  it('clear() does not abort a different generation\'s controller', () => {
    const mgr = new BackgroundTaskManager()
    const other = startTask(mgr, 2, 'call-2', 'web_search', deferred<string>().promise)

    mgr.clear(1)

    expect(other.controller.signal.aborted).toBe(false)
  })
})
