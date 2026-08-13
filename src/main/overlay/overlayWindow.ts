import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC, type DisplayBoundsPayload } from '../../shared/ipc'

let overlayWindow: BrowserWindow | null = null
// Read by the GET_DISPLAY_BOUNDS handler for the renderer's initial pull --
// see the "why a pull" note below.
let currentAccentColor = '#8b5cf6'

function unionOfDisplays(): { x: number; y: number; width: number; height: number } {
  const displays = screen.getAllDisplays()
  const minX = Math.min(...displays.map((d) => d.bounds.x))
  const minY = Math.min(...displays.map((d) => d.bounds.y))
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function currentDisplayBounds(accentColor: string): DisplayBoundsPayload {
  return {
    displays: screen.getAllDisplays().map((d) => d.bounds),
    primaryDisplay: screen.getPrimaryDisplay().bounds,
    accentColor
  }
}

function sendDisplayBounds(accentColor: string): void {
  overlayWindow?.webContents.send(IPC.DISPLAY_BOUNDS, currentDisplayBounds(accentColor))
}

export function createOverlayWindow(accentColor: string): BrowserWindow {
  currentAccentColor = accentColor
  const bounds = unionOfDisplays()

  overlayWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  // Windows clamps x/y/width/height passed to the BrowserWindow constructor to
  // the work area of a single display; setBounds() after construction doesn't
  // have that restriction, which is required to span multiple monitors.
  overlayWindow.setBounds(bounds)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // NOTE: we used to *push* display bounds once on 'did-finish-load'. That's
  // a race -- 'did-finish-load' can fire before React has mounted and
  // registered its IPC listener (especially in dev, where modules load over
  // the network), silently dropping the only copy of this data forever and
  // leaving the orb/frame never rendered. GET_DISPLAY_BOUNDS below lets the
  // renderer *pull* it once it's actually ready; the push path stays for
  // genuine later changes (monitor added/removed/rearranged).
  // removeHandler first -- createOverlayWindow can run again (e.g. macOS
  // 'activate' with no windows open) and ipcMain.handle throws on a
  // duplicate registration for the same channel.
  ipcMain.removeHandler(IPC.GET_DISPLAY_BOUNDS)
  ipcMain.handle(IPC.GET_DISPLAY_BOUNDS, () => currentDisplayBounds(currentAccentColor))

  overlayWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message)
  })

  screen.on('display-metrics-changed', () => {
    if (!overlayWindow) return
    const b = unionOfDisplays()
    overlayWindow.setBounds(b)
    sendDisplayBounds(currentAccentColor)
  })
  screen.on('display-added', () => sendDisplayBounds(currentAccentColor))
  screen.on('display-removed', () => sendDisplayBounds(currentAccentColor))

  ipcMain.on(IPC.SET_IGNORE_MOUSE, (_event, ignore: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true })
  })

  // Critical: showInactive() never steals OS focus from the user's active window.
  overlayWindow.showInactive()
  // Re-assert topmost right after the first show. Electron/Windows has a
  // known quirk where a setAlwaysOnTop() called before a window's first
  // show doesn't reliably stick in the OS z-order once other topmost
  // windows (taskbar, other apps' own always-on-top overlays) show up
  // later -- without this, Kira's orb silently ends up underneath normal
  // windows despite the flag being "set".
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  // Belt-and-suspenders: Windows lets other apps grab topmost status after
  // Kira does (e.g. anything that also calls SetWindowPos HWND_TOPMOST),
  // which silently buries the overlay with no event Electron surfaces for
  // "you got un-topmost'd". Periodically re-assert instead of chasing every
  // possible culprit.
  setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    }
  }, 3000)

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

// Voice-driven show/hide (tools/overlayControl.ts) -- purely visual, doesn't
// touch the session or the sidecar's mic/wake-word loop, which run
// independently of window visibility. hide() rather than close() since the
// window is non-closable by design (see createOverlayWindow's BrowserWindow
// options) and destroying it would lose the renderer's WebGL orb state.
export function hideOverlay(): void {
  overlayWindow?.hide()
}

export function showOverlay(): void {
  // showInactive(), not show() -- same reasoning as the initial reveal in
  // createOverlayWindow: never steal OS focus from the user's active window.
  overlayWindow?.showInactive()
  overlayWindow?.setAlwaysOnTop(true, 'screen-saver')
}

export function isOverlayVisible(): boolean {
  return overlayWindow?.isVisible() ?? false
}
