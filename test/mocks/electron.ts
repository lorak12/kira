// Test double for the `electron` module. Aliased in via vitest.config.ts so
// any main-process module under test can `import { ... } from 'electron'`
// without a real Electron runtime. Every export is a vi.fn() (or a thin
// class around them) so tests can assert on calls and override return
// values with `.mockResolvedValueOnce` etc. Reset between tests in
// test/setup.ts.
import { vi } from 'vitest'

export const shell = {
  openPath: vi.fn(async (_path: string): Promise<string> => ''),
  openExternal: vi.fn(async (_url: string): Promise<void> => undefined),
  showItemInFolder: vi.fn((_fullPath: string): void => undefined)
}

export const clipboard = {
  readText: vi.fn(() => ''),
  writeText: vi.fn((_text: string) => undefined)
}

export class Notification {
  static isSupported(): boolean {
    return true
  }
  // Test hook: every constructed instance's options land here, in order --
  // simpler than trying to spy on `new` itself. Cleared in test/setup.ts.
  static instances: Record<string, unknown>[] = []
  onclick: (() => void) | null = null
  show = vi.fn()
  constructor(public options: Record<string, unknown>) {
    Notification.instances.push(options)
  }
}

export const app = {
  getPath: vi.fn((name: string) => `/mock/${name}`),
  getVersion: vi.fn(() => '0.0.0-test'),
  whenReady: vi.fn(async () => undefined),
  on: vi.fn(),
  commandLine: { appendSwitch: vi.fn() }
}

export const screen = {
  getPrimaryDisplay: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })),
  getAllDisplays: vi.fn(() => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]),
  on: vi.fn()
}

export const desktopCapturer = {
  getSources: vi.fn(async () => [])
}

export const nativeImage = {
  createFromPath: vi.fn(() => ({ toPNG: () => Buffer.alloc(0) })),
  createEmpty: vi.fn(() => ({ toPNG: () => Buffer.alloc(0) }))
}

export const ipcMain = {
  on: vi.fn(),
  handle: vi.fn(),
  removeHandler: vi.fn()
}

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return []
  }
  webContents = { send: vi.fn(), on: vi.fn() }
  loadFile = vi.fn()
  loadURL = vi.fn()
  setBounds = vi.fn()
  setAlwaysOnTop = vi.fn()
  setIgnoreMouseEvents = vi.fn()
  setVisibleOnAllWorkspaces = vi.fn()
  hide = vi.fn()
  showInactive = vi.fn()
  isVisible = vi.fn(() => true)
  constructor(_options?: Record<string, unknown>) {}
}

export const globalShortcut = {
  register: vi.fn(() => true),
  unregister: vi.fn(),
  unregisterAll: vi.fn()
}
