import type { KiraConfig } from '../config/schema'
import type { ToolSchema } from '../llm/LlmEngine'
import type { ToolDefinition } from './types'
import { openAppTool } from './openApp'
import { openUrlTool, webSearchTool } from './openUrl'
import { mediaControlTool } from './mediaControl'
import { readClipboardTool, writeClipboardTool } from './clipboard'
import { screenshotTool, openScreenshotFolderTool } from './screenshot'
import { windowControlTool } from './windowControl'
import { lockScreenTool, systemPowerTool, cancelShutdownTool } from './powerControl'
import { setVolumeTool } from './volume'
import { setBrightnessTool } from './brightness'
import { findFilesTool, openFileTool } from './fileSearch'
import { listRunningAppsTool, closeAppTool } from './appOps'
import { calculatorTool } from './calculator'
import { unitConvertTool } from './unitConvert'
import { datetimeTool } from './datetime'
import { weatherTool } from './weather'
import { currencyConvertTool } from './currency'
import { systemStatusTool } from './systemStatus'
import { setTimerTool, listTimersTool, cancelTimerTool } from './timers'
import { addNoteTool, listNotesTool } from './notes'
import { createOpenProjectTool } from './openProject'
import { noReplyTool, endConversationTool } from './sessionControl'
import { getActiveWindowTool } from './context'
import { openSettingsTool } from './settings'
import { readWebpageTool } from './webRead'
import { readFileTool } from './readFile'
import { watchSystemMetricTool, listWatchesTool, cancelWatchTool } from './systemWatch'
import { hideOverlayTool, showOverlayTool } from './overlayControl'

export interface ToolRegistry {
  getToolSchemas(): ToolSchema[]
  getTool(name: string): ToolDefinition | undefined
}

/**
 * Builds the tool registry for a loaded config -- some tools (open_project)
 * need config data, so this isn't static module state. `extraTools` is how
 * KIRA_SIM=1 (see index.ts, simulation/demoTools.ts) adds a demo-only slow
 * tool without it ever being reachable in a normal run.
 */
export function createToolRegistry(config: KiraConfig, extraTools: ToolDefinition[] = []): ToolRegistry {
  const allTools: ToolDefinition[] = [
    openAppTool,
    openUrlTool,
    webSearchTool,
    mediaControlTool,
    readClipboardTool,
    writeClipboardTool,
    screenshotTool,
    openScreenshotFolderTool,
    windowControlTool,
    lockScreenTool,
    systemPowerTool,
    cancelShutdownTool,
    setVolumeTool,
    setBrightnessTool,
    findFilesTool,
    openFileTool,
    listRunningAppsTool,
    closeAppTool,
    calculatorTool,
    unitConvertTool,
    datetimeTool,
    weatherTool,
    currencyConvertTool,
    systemStatusTool,
    setTimerTool,
    listTimersTool,
    cancelTimerTool,
    addNoteTool,
    listNotesTool,
    createOpenProjectTool(config),
    // Omitted entirely (not just discouraged in the persona prompt) when
    // assistant.alwaysConfirm is set -- otherwise the tool would still be
    // callable even though the prompt no longer tells the LLM to use it.
    ...(config.assistant.alwaysConfirm ? [] : [noReplyTool]),
    endConversationTool,
    getActiveWindowTool,
    openSettingsTool,
    readWebpageTool,
    readFileTool,
    watchSystemMetricTool,
    listWatchesTool,
    cancelWatchTool,
    hideOverlayTool,
    showOverlayTool,
    ...extraTools
  ]

  // tools.disabled in kira.config.json -- excluded entirely rather than
  // just left un-called, so a disabled tool never even shows up in what
  // the LLM sees via getToolSchemas().
  const disabled = new Set(config.tools.disabled)
  const knownNames = new Set(allTools.map((t) => t.schema.name))
  for (const name of disabled) {
    if (!knownNames.has(name)) {
      console.warn(`[kira] tools.disabled lists "${name}", which doesn't match any tool name -- typo?`)
    }
  }
  const TOOLS = allTools.filter((t) => !disabled.has(t.schema.name))

  const byName = new Map(TOOLS.map((t) => [t.schema.name, t]))

  return {
    getToolSchemas: () => TOOLS.map((t) => t.schema),
    getTool: (name: string) => byName.get(name)
  }
}
