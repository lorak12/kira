// Test double for '@electron-toolkit/utils'. Needed because that package's
// real build does `require('electron')` at module load time -- a plain CJS
// require, which bypasses vitest.config.ts's `electron` alias (that alias
// only rewrites ESM import statements vitest transforms itself) and hits the
// real electron package instead, which has no named exports outside an
// actual Electron runtime and throws. Aliased the same way as `electron`
// itself in vitest.config.ts.
import { vi } from 'vitest'

export const is = { dev: false }

export const electronApp = {
  setAppUserModelId: vi.fn(),
  setAutoLaunch: vi.fn()
}

export const optimizer = {
  watchWindowShortcuts: vi.fn()
}
