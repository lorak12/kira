import { globalShortcut } from 'electron'
import type { KiraConfig } from '../config/schema'

interface HotkeyHandlers {
  onMute: () => void
  onDismiss: () => void
}

export function registerHotkeys(config: KiraConfig, handlers: HotkeyHandlers): void {
  const muteOk = globalShortcut.register(config.hotkeys.mute, handlers.onMute)
  if (!muteOk) {
    console.error(`[kira] failed to register mute hotkey "${config.hotkeys.mute}" (already in use?)`)
  }

  const dismissOk = globalShortcut.register(config.hotkeys.dismiss, handlers.onDismiss)
  if (!dismissOk) {
    console.error(
      `[kira] failed to register dismiss hotkey "${config.hotkeys.dismiss}" -- ` +
        'it may be reserved by Windows. Try a different combo in kira.config.json (e.g. "Control+Alt+K").'
    )
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
