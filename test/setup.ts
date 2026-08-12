import { afterEach, vi } from 'vitest'
import { Notification } from 'electron'

// Every test gets fresh mock call history — no leaking assertions/state
// between tool tests.
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  Notification.instances = []
})
