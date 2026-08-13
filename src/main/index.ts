import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow, getOverlayWindow, showOverlay } from './overlay/overlayWindow'
import { loadConfig } from './config/configStore'
import { SidecarClient } from './wake-word/sidecarClient'
import { createSttEngine } from './stt'
import { OpenRouterEngine } from './llm/openRouterClient'
import { createTtsEngine } from './tts'
import { pickGreeting } from './llm/greetings'
import { buildSystemPrompt } from './llm/personaPrompt'
import type { ChatMessage, ToolCall } from './llm/LlmEngine'
import { createToolRegistry } from './tools/registry'
import { isAffirmative, isNegative } from './llm/confirmation'
import { SessionGuard } from './llm/sessionGuard'
import { trimHistory, truncateForHistory } from './llm/historyManagement'
import { BackgroundTaskManager } from './llm/backgroundTasks'
import { splitForStreaming } from './llm/sentenceSplit'
import { buildRecentNotesContext } from './tools/notes'
import { restoreTimers } from './tools/timers'
import { initSystemWatch } from './tools/systemWatch'
import { registerHotkeys, unregisterHotkeys } from './hotkeys/globalHotkeys'
import { IPC, type ActivityKind, type KiraState } from '../shared/ipc'
import { FakeSidecarClient } from './simulation/fakeSidecar'
import { runMultitaskDemo, runTimerCheckDemo, runToolsCheckDemo, runConfigCheckDemo } from './simulation/scenario'
import { researchProjectTool } from './simulation/demoTools'
import { log, logError } from './logger'

// How many tool-call steps deep a single turn can go, how long a tool call
// gets before it's treated as slow enough to background (see
// runAgentStep()'s Promise.race and llm/backgroundTasks.ts), and how much
// history gets sent to the LLM are all configurable per-install via
// assistant.maxAgentSteps/backgroundThresholdMs/maxHistoryMessages in
// kira.config.json -- read from `config` inside app.whenReady() below, not
// module-level constants, since config isn't loaded until then.

// `reply: null` means "this turn was superseded, say nothing and touch no
// shared state" (see sessionGuard.ts); `reply: ''` means the LLM explicitly
// chose to stay silent (see the no_reply tool); `endSession: true` means
// the LLM called end_conversation and `reply` is its farewell.
interface AgentStepResult {
  reply: string | null
  endSession: boolean
}
const SUPERSEDED: AgentStepResult = { reply: null, endSession: false }

// Every console.log/console.error in the app (via logger.ts's log/logError,
// plus sidecarClient.ts forwarding the Python sidecar's own stdout/stderr
// through this process's own streams) ultimately calls process.stdout/
// stderr.write(). Under the supervised background launch (run-kira.ps1),
// that write goes over a real OS pipe to the supervisor script -- and if
// that pipe's reader ever goes away (the hidden terminal was force-closed,
// the supervisor script was killed, etc.), the next write throws EPIPE.
// Writable streams emit 'error' for that rather than throwing synchronously,
// but Node's default behavior for an 'error' event with no listener is to
// throw anyway -- which showed up as Electron's "uncaught exception in main
// process" dialog and left Kira running but non-functional. Attaching a
// no-op listener here makes every write()-that-fails-because-nobody's-
// listening a silent no-op instead, for every stream consumer in the app.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err
})
process.stderr.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EPIPE') throw err
})

// Last-resort net: log (best-effort -- logError itself is now EPIPE-safe
// per above) and keep running rather than let Electron's default handler
// pop the "JavaScript error occurred in the main process" dialog, which
// reads as Kira being frozen/dead to a voice-only user with no way to see
// or dismiss it.
process.on('uncaughtException', (err) => {
  logError('[kira] uncaught exception (recovered)', err)
})
process.on('unhandledRejection', (reason) => {
  logError('[kira] unhandled rejection (recovered)', reason)
})

// Kira now launches automatically at login (see scripts/run-kira.ps1) and a
// user could also double-click a shortcut on top of that -- without a lock,
// two instances would both open the mic/wake-word sidecar and fight over it.
// The second launch just quits immediately and lets the first one keep
// running; nothing to focus/restore since the overlay is non-closable and
// already on screen.
if (!app.requestSingleInstanceLock()) {
  // app.quit() alone isn't enough here: it's async (runs before-quit/
  // will-quit first) and app.whenReady() below could still resolve and start
  // spawning the sidecar/mic before it takes effect. Nothing has been
  // initialized yet at this point in the module, so exiting immediately is
  // safe and guarantees no double init.
  app.quit()
  process.exit(0)
}

// TTS playback is triggered programmatically (no user click), which Chromium's
// autoplay policy would otherwise block.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Set (only under KIRA_SIM=1) so the fake sidecar's scripted scenario can
// time an interruption off a real state transition (e.g. "wait until she's
// actually speaking, then interrupt") instead of guessing at LLM/TTS
// latency. See simulation/fakeSidecar.ts.
let simStateHook: ((state: KiraState) => void) | null = null

function setState(state: KiraState): void {
  getOverlayWindow()?.webContents.send(IPC.STATE_CHANGED, state)
  simStateHook?.(state)
}

function stopAudio(): void {
  getOverlayWindow()?.webContents.send(IPC.STOP_AUDIO)
}

// Feeds the secondary-display activity panel -- a glanceable "what is she
// doing" readout, not a debug log, so entries stay short and few (see
// truncate()/ActivityPanel's MAX_ENTRIES) rather than dumping everything.
let activityId = 0

function truncate(text: string, max = 140): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

function emitActivity(kind: ActivityKind, text: string): void {
  activityId += 1
  getOverlayWindow()?.webContents.send(IPC.ACTIVITY_EVENT, { id: activityId, kind, text: truncate(text) })
}

function resetActivity(): void {
  getOverlayWindow()?.webContents.send(IPC.ACTIVITY_RESET)
}

// Visual-only preview loop for checking overlay UI changes without the real
// mic/wake-word/LLM/TTS pipeline (e.g. while the wake-word model is still
// training and shouldn't be fighting the sidecar for the mic/GPU). Opt-in
// via KIRA_UI_PREVIEW=1; cycles through every state on a loop so there's
// always something on screen to look at.
const PREVIEW_CYCLE: KiraState[] = ['listening', 'transcribing', 'thinking', 'speaking', 'idle']
const PREVIEW_STEP_MS = 2600
// Fake activity lines lined up with PREVIEW_CYCLE's steps, so the second-
// screen panel is demoable too -- index -1 (idle) emits nothing.
const PREVIEW_ACTIVITY: Array<{ kind: ActivityKind; text: string } | null> = [
  { kind: 'user', text: 'open spotify and turn the volume up a bit' },
  null,
  null,
  { kind: 'tool', text: 'open_app → Opened Spotify.' },
  null
]

function runUiPreviewLoop(): void {
  let i = 0
  const step = (): void => {
    if (i === 0) resetActivity()
    setState(PREVIEW_CYCLE[i])
    const activity = PREVIEW_ACTIVITY[i]
    if (activity) emitActivity(activity.kind, activity.text)
    if (PREVIEW_CYCLE[i] === 'speaking') emitActivity('reply', "Done -- Spotify's open and volume's up a bit.")
    i = (i + 1) % PREVIEW_CYCLE.length
    setTimeout(step, PREVIEW_STEP_MS)
  }
  step()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kira.assistant')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  let config
  try {
    config = loadConfig()
  } catch (err) {
    logError('[kira] config error:', (err as Error).message)
    createOverlayWindow('#8b5cf6')
    return
  }

  createOverlayWindow(config.overlay.accentColor)

  if (process.env.KIRA_UI_PREVIEW === '1') {
    log('[kira] KIRA_UI_PREVIEW=1 -- skipping mic/wake-word/LLM/TTS, cycling overlay states for a visual check only')
    runUiPreviewLoop()
    return
  }

  // KIRA_SIM=1 runs a scripted, voice-free walkthrough of the multitasking
  // + turn-shaping features (background tasks, no_reply, end_conversation,
  // wake/mute interruptions) against the *real* LLM/TTS/overlay pipeline --
  // only the mic/wake-word/STT are swapped for a fake sidecar that plays
  // back a fixed script. See simulation/{fakeSidecar,scenario,demoTools}.ts.
  // KIRA_SIM=1 -> the full multitask/interruption walkthrough;
  // KIRA_SIM=timers -> spoken/persistent timers + streamed multi-sentence
  // TTS; KIRA_SIM=tools -> read_webpage/read_file/watch_system_metric/
  // atIso reminders; KIRA_SIM=config -> wit/verbosity/tools.disabled/edge
  // prosody config tuning. Anything else/unset -> normal operation.
  const SIM_SCENARIOS = {
    '1': runMultitaskDemo,
    timers: runTimerCheckDemo,
    tools: runToolsCheckDemo,
    config: runConfigCheckDemo
  } as const
  const simMode = process.env.KIRA_SIM as keyof typeof SIM_SCENARIOS | undefined
  const isSim = simMode !== undefined && simMode in SIM_SCENARIOS
  const simScenario = isSim ? SIM_SCENARIOS[simMode] : runMultitaskDemo
  if (isSim) {
    log(`[kira] KIRA_SIM=${simMode} -- running a scripted demo, no mic/wake-word/STT involved`)
  }
  const sidecar = isSim ? new FakeSidecarClient(config, simScenario) : new SidecarClient(config)
  if (isSim) simStateHook = (state) => (sidecar as FakeSidecarClient).notifyState(state)
  const sttEngine = createSttEngine(config)
  const llmEngine = new OpenRouterEngine(config)
  const ttsEngine = createTtsEngine(config)
  const { getToolSchemas, getTool } = createToolRegistry(config, isSim ? [researchProjectTool] : [])

  // A "session" spans from wake word to however many back-and-forth turns
  // the user wants, ending only on silence, an error, or an explicit
  // dismiss (hotkey) -- not after a single reply. lastLang seeds the next
  // session's greeting language with whatever the user actually spoke last.
  let sessionActive = false
  let lastLang: string = config.assistant.defaultLanguage
  // Tool calls/results within a session so Kira remembers what she already
  // did/said this conversation; cleared whenever a session starts or ends.
  let history: ChatMessage[] = []
  // Risky tool calls (system_power, close_app, ...) the agent wants to run
  // but hasn't gotten spoken confirmation for yet, oldest first. Every
  // risky call in a batch gets parked here -- NOT just the first -- and
  // each spoken reply resolves exactly one, in order; whatever's left stays
  // queued and the LLM naturally re-prompts for it next turn (its "not
  // executed yet" tool message is still sitting in history).
  let pendingConfirmations: ToolCall[] = []
  // See sessionGuard.ts: the sidecar can detect a new wake word while a
  // previous turn is still awaiting the LLM/a tool, so every in-flight async
  // turn must be able to notice it's been superseded and stop touching
  // shared state instead of racing the new one.
  const sessionGuard = new SessionGuard()
  // Tool calls that turned out to be slow enough to keep running in the
  // background instead of blocking their turn (see
  // config.assistant.backgroundThresholdMs, used below). Scoped to a
  // session generation the same way pendingConfirmations/history are --
  // resetSession() below drops whatever was in flight for the old one.
  const backgroundTasks = new BackgroundTaskManager()
  // Serializes every "turn" (a user transcript, or Kira proactively
  // announcing a finished background task) onto a single chain so they
  // never interleave writes to `history` or talk over each other -- while
  // still letting a backgrounded tool's own promise run fully concurrently
  // with whatever turn comes next (it's not part of this chain at all).
  let turnChain: Promise<void> = Promise.resolve()
  // Turn-latency instrumentation -- set when speech ends (mic capture done)
  // and read back once a transcript arrives, so a slow turn's log shows
  // exactly how long STT took vs. everything after it (LLM/tools/TTS below).
  // There was no way to tell these apart before; "she's slow" could mean
  // local Whisper, the LLM call, or synthesis, and the only way to find out
  // used to be config to eyeball wall-clock. See handleTranscript/speak.
  let speechEndedAt: number | null = null

  function serialize(fn: () => Promise<void>): void {
    turnChain = turnChain
      .catch(() => {})
      .then(fn)
      .catch((err) => logError('[kira] serialized turn failed:', (err as Error).message))
  }

  function resetSession(): void {
    backgroundTasks.clear(sessionGuard.current())
    sessionGuard.next()
    sessionActive = false
    history = []
    pendingConfirmations = []
  }

  // Shared by the mute keyword, mute hotkey, and barge-in: stop whatever's
  // currently playing/pending and go straight back to listening (without
  // needing the wake word again) if a session is still active, otherwise
  // just settle to idle. Doesn't touch sessionGuard/history -- unlike
  // resetSession(), this isn't ending the turn, just cutting off its audio;
  // whatever the LLM/tool loop is still producing for it will still arrive
  // and get spoken once ready (see speak()'s isCurrent check).
  function interruptAndListen(): void {
    sidecar.abort()
    stopAudio()
    // stopAudio() pauses the renderer's <audio> element directly rather than
    // letting it run to a natural 'ended' event, so PLAYBACK_ENDED (which
    // would otherwise clear this) never fires -- clear it here instead.
    // Also covers an interrupt landing mid-"thinking" (before any audio
    // exists yet to stop).
    sidecar.notifyBusy(false)
    if (sessionActive) {
      sidecar.startListening()
      setState('listening')
    } else {
      setState('idle')
    }
  }

  async function speak(text: string, lang: string, gen: number): Promise<void> {
    if (!sessionGuard.isCurrent(gen)) {
      log('[kira] dropping speak() from a superseded turn')
      return
    }
    setState('speaking')
    // Also set at the start of "thinking" (handleTranscript/announceIfIdle)
    // so barge-in works before she's even started replying -- this call is
    // just belt-and-suspenders for any path that reaches speak() without
    // going through a "thinking" phase first (e.g. the wake-word greeting).
    // See notifyBusy's doc comment. Cleared on PLAYBACK_ENDED, or
    // immediately here if synthesis itself fails below.
    sidecar.notifyBusy(true)
    // The renderer now queues chunks (AudioPlayer.tsx) so a multi-sentence
    // reply plays back-to-back without gaps -- but that means a fresh
    // PLAY_AUDIO no longer implicitly cuts off whatever was already
    // playing the way a single shared <audio>.src swap used to. Every call
    // to speak() is a brand new thing to say (a reply superseding whatever
    // Kira might still be finishing from before -- e.g. a wake-word
    // interrupt), never a continuation of a previous speak() call's own
    // chunks, so clear the renderer's queue once up front here; the chunk
    // loop below then queues cleanly behind that clean slate.
    stopAudio()
    // Short/single-sentence replies (most of them) come back as one chunk,
    // unchanged from before. A longer reply is split so sentence 1 starts
    // playing while sentence 2+ are still being synthesized -- each chunk
    // is sent to the renderer's playback queue as soon as it's ready, not
    // once the whole reply is done, cutting the dead-air gap before she
    // starts talking on anything longer than a one-liner.
    const chunks = splitForStreaming(text)
    const ttsStartedAt = Date.now()
    try {
      for (let i = 0; i < chunks.length; i++) {
        const audioBuffer = await ttsEngine.synthesize(chunks[i], lang)
        if (i === 0) log(`[kira] TTS first chunk took ${Date.now() - ttsStartedAt}ms`)
        if (!sessionGuard.isCurrent(gen)) return
        getOverlayWindow()?.webContents.send(IPC.PLAY_AUDIO, {
          audioBase64: audioBuffer.toString('base64'),
          mimeType: 'audio/mpeg',
          isLast: i === chunks.length - 1
        })
      }
      // Next state transition happens when the renderer reports playback of
      // the *last* chunk finished (IPC.PLAYBACK_ENDED below), not here --
      // synthesis finishing isn't the same as the audio finishing playing.
    } catch (err) {
      logError('[kira] TTS synthesis failed:', (err as Error).message)
      sidecar.notifyBusy(false)
      if (sessionGuard.isCurrent(gen)) {
        resetSession()
        setState('idle')
      }
    }
  }

  async function runAgentStep(lang: string, gen: number, depth = 0): Promise<AgentStepResult> {
    if (depth >= config.assistant.maxAgentSteps) {
      const text =
        lang === 'pl'
          ? 'Przepraszam, to zajmuje zbyt wiele kroków. Spróbujmy inaczej.'
          : "Sorry, that's taking too many steps -- let's try a different approach."
      return { reply: text, endSession: false }
    }

    // Every call sees the full history, which already includes any settled
    // background task's result (backgroundTasks.onSettle pushes it as soon
    // as it happens -- see below) -- so this call is *a* delivery channel
    // for it regardless of whether it's a real user turn or a proactive
    // announceIfIdle() call. Marking it announced here, unconditionally,
    // closes a real race: a task can settle right as an unrelated real turn
    // is already in flight, get folded into that turn's own reply naturally
    // (the LLM sees it in context), while announceIfIdle() -- queued
    // separately off the same settle event -- is still waiting its turn on
    // turnChain. Without this, that queued call would find hasUnannounced()
    // still true and speak the same result a second time. Whichever call
    // reaches here first "claims" it; the other sees it's already spoken
    // for and skips.
    backgroundTasks.markAnnounced(gen)

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt(lang, {
          wit: config.assistant.wit,
          verbosity: config.assistant.verbosity,
          alwaysConfirm: config.assistant.alwaysConfirm
        })
      }
    ]
    // Live status (not baked into `history`) so the LLM can answer "how's
    // that going?" with an accurate elapsed time instead of the static
    // "still running" placeholder that was pushed when the call started.
    const runningTasks = backgroundTasks.listRunning(gen)
    if (runningTasks.length) {
      const lines = runningTasks.map((t) => {
        const elapsedSec = Math.round((Date.now() - t.startedAt) / 1000)
        return `- ${t.id} (${t.name}): still running, started ${elapsedSec}s ago.`
      })
      messages.push({ role: 'system', content: `Background tasks still in progress:\n${lines.join('\n')}` })
    }
    messages.push(...trimHistory(history, config.assistant.maxHistoryMessages))
    const response = await llmEngine.chat(messages, getToolSchemas())
    if (!sessionGuard.isCurrent(gen)) {
      log('[kira] dropping LLM response from a superseded turn')
      return SUPERSEDED
    }

    if (response.type === 'text') {
      history.push({ role: 'assistant', content: response.content })
      return { reply: response.content, endSession: false }
    }

    history.push({ role: 'assistant', content: '', toolCalls: response.calls })
    // Set by the no_reply/end_conversation calls below -- checked only
    // after every call in this batch has been handled, so their position
    // in the batch doesn't matter (e.g. end_conversation first, a last
    // trivial tool call after it, in whatever order the LLM emitted them).
    let staySilent = false
    let endSession = false
    for (const call of response.calls) {
      // Session-control calls (tools/sessionControl.ts) aren't real actions
      // -- they tell this loop how the turn/conversation should end, so
      // they're handled here instead of falling through to the generic
      // executor below.
      if (call.name === 'no_reply') {
        staySilent = true
        emitActivity('tool', 'no_reply → staying silent')
        history.push({ role: 'tool', content: 'Acknowledged -- staying silent.', toolCallId: call.id, name: call.name })
        continue
      }
      if (call.name === 'end_conversation') {
        endSession = true
        // Kill right away, not after the farewell is spoken -- "kill my
        // searches" shouldn't wait on TTS.
        backgroundTasks.clear(gen)
        emitActivity('tool', 'end_conversation → ending session')
        history.push({
          role: 'tool',
          content: 'Acknowledged -- give a short warm sign-off as your next reply; the session will end after you speak.',
          toolCallId: call.id,
          name: call.name
        })
        continue
      }

      const tool = getTool(call.name)

      // Risky tools (system_power, close_app, ...) never run on the first
      // pass -- park the call and let the LLM ask the user to confirm.
      if (tool?.risky) {
        log(`[kira] risky tool call awaiting confirmation: ${call.name}(${JSON.stringify(call.arguments)})`)
        pendingConfirmations.push(call)
        emitActivity('tool', `${call.name} → awaiting confirmation`)
        history.push({
          role: 'tool',
          content:
            'Not executed -- this action needs the user to explicitly confirm out loud first. Ask them to confirm (yes/no); do not say it already happened.',
          toolCallId: call.id,
          name: call.name
        })
        continue
      }

      log(`[kira] tool call: ${call.name}(${JSON.stringify(call.arguments)})`)
      const controller = new AbortController()
      const execPromise = tool
        ? tool.execute(call.arguments, controller.signal).catch((err: Error) => `Error: ${err.message}`)
        : Promise.resolve(`Unknown tool "${call.name}".`)
      // Race the call against the background threshold instead of always
      // awaiting it to completion -- a slow tool (deep search, etc.) then
      // keeps running under BackgroundTaskManager while this turn moves on
      // to the rest of the batch (e.g. "look into X and open Spotify") and
      // finishes normally, rather than the whole turn stalling on it.
      const outcome = await Promise.race<{ done: true; result: string } | { done: false }>([
        execPromise.then((result) => ({ done: true, result })),
        new Promise((resolve) => setTimeout(() => resolve({ done: false }), config.assistant.backgroundThresholdMs))
      ])
      if (!sessionGuard.isCurrent(gen)) {
        // The tool already ran (or is still running) -- its real-world side
        // effect (app opened, file saved, ...) can't be undone -- but this
        // turn's conversation bookkeeping is abandoned, so don't let its
        // result bleed into whatever session superseded it. It's not
        // registered under backgroundTasks yet if it hasn't hit the
        // threshold, so abort it directly here too.
        controller.abort()
        log(`[kira] tool "${call.name}" finished after its turn was superseded; discarding the result`)
        return SUPERSEDED
      }
      if (outcome.done) {
        log(`[kira] tool result: ${outcome.result}`)
        emitActivity('tool', `${call.name} → ${outcome.result}`)
        history.push({ role: 'tool', content: truncateForHistory(outcome.result), toolCallId: call.id, name: call.name })
      } else {
        const taskId = backgroundTasks.start(gen, call.id, call.name, execPromise, controller)
        log(`[kira] tool "${call.name}" is taking a while -- continuing in the background as ${taskId}`)
        emitActivity('tool', `${call.name} → running in background (${taskId})`)
        history.push({
          role: 'tool',
          content: `Still running in the background as task ${taskId}. You'll get the real result later as a system message -- don't say it's finished yet.`,
          toolCallId: call.id,
          name: call.name
        })
      }
    }

    // no_reply means the LLM already decided this turn needs no spoken
    // reply -- stop here rather than asking it again for text it just said
    // it didn't want to give.
    if (staySilent) return { reply: '', endSession }

    const next = await runAgentStep(lang, gen, depth + 1)
    return { reply: next.reply, endSession: endSession || next.endSession }
  }

  // Executes or cancels the oldest pending risky tool call, recording the
  // outcome as a `system` note rather than a second `tool` message -- each
  // tool_call id already got its one required tool response when the call
  // was parked, and OpenAI-style APIs reject a duplicate.
  async function resolvePendingConfirmation(text: string, gen: number): Promise<void> {
    if (!pendingConfirmations.length) return
    const call = pendingConfirmations.shift()!

    if (!isAffirmative(text) || isNegative(text)) {
      // Anything that isn't a clear yes counts as declining -- including a
      // change of subject, which the LLM can react to on its own next turn
      // since the user's actual words are still pushed as a user message.
      emitActivity('tool', `${call.name} → cancelled`)
      history.push({
        role: 'system',
        content: `The user did not confirm the pending "${call.name}" action. It was cancelled and must not run.`
      })
      return
    }

    log(`[kira] confirmed risky tool call: ${call.name}`)
    const tool = getTool(call.name)
    const result = tool
      ? await tool.execute(call.arguments).catch((err: Error) => `Error: ${err.message}`)
      : `Unknown tool "${call.name}".`
    if (!sessionGuard.isCurrent(gen)) {
      log(`[kira] confirmed tool "${call.name}" finished after its turn was superseded; discarding the result`)
      return
    }
    emitActivity('tool', `${call.name} → ${result}`)
    history.push({ role: 'system', content: `The user confirmed. Result of "${call.name}": ${truncateForHistory(result)}` })
  }

  // Speaks (or silently no-ops on) an agent step's outcome, shared by
  // handleTranscript and announceIfIdle so both honor no_reply/
  // end_conversation (see tools/sessionControl.ts) the same way.
  async function deliverReply(result: AgentStepResult, lang: string, gen: number): Promise<void> {
    if (!sessionGuard.isCurrent(gen) || result.reply === null) return
    if (!result.reply.trim()) {
      // no_reply: the action already speaks for itself (activity panel has
      // it) -- go straight back to listening instead of playing dead air.
      // speak() never runs on this path, so nothing else clears the "busy"
      // window opened at the start of "thinking" -- do it here instead.
      sidecar.notifyBusy(false)
      log('[kira] Kira: (staying silent)')
      if (sessionActive) {
        sidecar.startListening()
        setState('listening')
      } else {
        setState('idle')
      }
    } else {
      log(`[kira] Kira: ${result.reply}`)
      emitActivity('reply', result.reply)
      await speak(result.reply, lang, gen)
    }
    if (result.endSession && sessionGuard.isCurrent(gen)) {
      // Runs after the farewell's audio has been *handed off* (speak()
      // resolves once PLAY_AUDIO is sent, not once playback finishes), so
      // sessionActive flips to false before IPC.PLAYBACK_ENDED fires and it
      // naturally goes to 'idle' instead of looping back to 'listening'.
      resetSession()
    }
  }

  async function handleTranscript(text: string, lang: string): Promise<void> {
    log(`[kira] transcript (${lang}): ${text}`)
    // Captured once, up front -- reflects whichever session/turn is live
    // right now. If a new wake word interrupts before this function
    // finishes, sessionGuard.next() (inside resetSession()) invalidates
    // this value, and every check below stops this turn from touching the
    // new session's state.
    const gen = sessionGuard.current()

    if (!text.trim()) {
      // Silence (or an empty/hallucinated transcript) ends the session --
      // this is what makes "listen again" not listen forever.
      if (sessionGuard.isCurrent(gen)) {
        resetSession()
        setState('idle')
      }
      return
    }

    lastLang = lang
    emitActivity('user', text)
    history.push({ role: 'user', content: text })
    await resolvePendingConfirmation(text, gen)
    if (!sessionGuard.isCurrent(gen)) return
    setState('thinking')
    // Opens the barge-in "interruptible" window here rather than waiting
    // for speak() -- lets the user cut her off while she's still
    // thinking/running tools, not just once she's started talking. See
    // notifyBusy's doc comment.
    sidecar.notifyBusy(true)
    const thinkingStartedAt = Date.now()
    try {
      const result = await runAgentStep(lang, gen)
      log(`[kira] LLM/tools took ${Date.now() - thinkingStartedAt}ms`)
      await deliverReply(result, lang, gen)
    } catch (err) {
      logError('[kira] LLM call failed:', (err as Error).message)
      // Previously this just went straight to idle with no spoken reply --
      // from a voice-only user's perspective that's indistinguishable from
      // Kira being dead/frozen (this is exactly what an OpenRouter 402
      // "out of credits" error looked like). A short apology at least says
      // *something* went wrong instead of silence.
      if (sessionGuard.isCurrent(gen)) {
        const text =
          lang === 'pl'
            ? 'Przepraszam, coś poszło nie tak po mojej stronie. Spróbuj jeszcze raz.'
            : "Sorry, something went wrong on my end. Try again in a moment."
        // speak() itself handles "busy" clearing via PLAYBACK_ENDED (or its
        // own catch, if TTS synthesis also fails) -- same as the normal
        // end_conversation path in deliverReply, resetSession() runs right
        // after handing the audio off so sessionActive flips false before
        // PLAYBACK_ENDED fires and this goes to idle rather than looping
        // back to listening.
        await speak(text, lang, gen)
        resetSession()
      } else {
        sidecar.notifyBusy(false)
      }
    }
  }

  // Fires (via serialize(), see backgroundTasks.onSettle below) once a
  // background task has settled and the turn chain has drained -- i.e. Kira
  // isn't already mid-turn. Interrupts 'listening' the same way the mute
  // hotkey does (sidecar.abort()) so she isn't talking over live mic
  // capture, then runs a normal agent step off the system message that was
  // already pushed into history so the LLM can relay the result naturally.
  async function announceIfIdle(): Promise<void> {
    const gen = sessionGuard.current()
    // This is only a gate, not the actual marking -- runAgentStep() marks
    // every settled task as announced the moment it builds its message
    // list (see the comment there), which is also what stops a real turn
    // that beat this queued call to the punch from getting double-spoken.
    if (!sessionActive || !backgroundTasks.hasUnannounced(gen)) return
    sidecar.abort()
    setState('thinking')
    sidecar.notifyBusy(true)
    try {
      const result = await runAgentStep(lastLang, gen)
      await deliverReply(result, lastLang, gen)
    } catch (err) {
      logError('[kira] background task announcement failed:', (err as Error).message)
      sidecar.notifyBusy(false)
      if (sessionGuard.isCurrent(gen)) setState('listening')
    }
  }

  // Unlike announceIfIdle (which only speaks up mid an already-live
  // conversation), a fired timer should be able to interrupt full idle --
  // "remind me in 20 minutes" is worthless if it only speaks when Kira
  // happens to already be talking to someone. If no session is active,
  // this opens a lightweight one-shot one so the user can naturally reply
  // ("thanks" / "snooze 5 more") without needing the wake word first; if a
  // real conversation is already underway, it's folded into that instead
  // via the same serialize()+history mechanism background tasks use.
  function announceProactively(text: string): void {
    serialize(async () => {
      if (!sessionActive) {
        showOverlay() // undo any earlier hide_overlay call -- a proactive wake also needs visual feedback
        sessionGuard.next()
        sessionActive = true
        history = []
        resetActivity()
      }
      const gen = sessionGuard.current()
      history.push({ role: 'assistant', content: text })
      emitActivity('reply', text)
      sidecar.abort()
      await deliverReply({ reply: text, endSession: false }, lastLang, gen)
    })
  }

  backgroundTasks.onSettle = (task) => {
    log(`[kira] background task ${task.id} (${task.name}) settled: ${task.status}`)
    if (!sessionGuard.isCurrent(task.gen)) {
      // Its session ended before it finished -- resetSession() already
      // clear()'d it, so this shouldn't normally fire, but stay defensive.
      log('[kira] background task settled after its session ended; dropping the result')
      return
    }
    history.push({
      role: 'system',
      content: `Background task ${task.id} (${task.name}) finished (${task.status}). Result: ${truncateForHistory(task.result ?? '')}`
    })
    emitActivity('tool', `${task.name} (background) → ${task.result}`)
    // Queued rather than called directly -- if a turn (or another
    // announcement) is already running, this waits its turn on turnChain
    // instead of interleaving with it.
    serialize(() => announceIfIdle())
  }

  ipcMain.on(IPC.PLAYBACK_ENDED, () => {
    sidecar.notifyBusy(false)
    if (sessionActive) {
      // Loop: go back to listening for the next thing the user says,
      // without needing the wake word again.
      sidecar.startListening()
      setState('listening')
    } else {
      setState('idle')
    }
  })

  sidecar.on('wake', () => {
    log('[kira] wake word detected')
    showOverlay() // undo any earlier hide_overlay call -- a fresh session always gets visual feedback
    resetSession()
    resetActivity()
    sessionActive = true
    const gen = sessionGuard.current()
    void speak(pickGreeting(lastLang, config.assistant.extraGreetings), lastLang, gen)
    // Not awaited -- greeting speaks immediately regardless of disk speed;
    // this only needs to land in `history` before the user's *first* real
    // turn of the session, which is always at least a full utterance away.
    void buildRecentNotesContext().then((context) => {
      if (context && sessionGuard.isCurrent(gen)) history.push({ role: 'system', content: context })
    })
  })

  sidecar.on('mute', () => {
    log('[kira] mute keyword detected')
    interruptAndListen()
  })

  // Real barge-in (config.bargeIn, off by default -- see TODO-barge-in.md
  // and schema.ts's comment on why): the sidecar only emits this while it
  // knows Kira's own TTS is playing and heard sustained speech-level audio
  // over it. Same reaction as the mute keyword -- cut the audio, keep the
  // session, go straight to listening for what the user actually said
  // instead of making them repeat the wake word.
  sidecar.on('bargeIn', () => {
    log('[kira] barge-in detected (user talked over Kira)')
    interruptAndListen()
  })

  sidecar.on('speechEnd', () => {
    log('[kira] speech ended, transcribing...')
    speechEndedAt = Date.now()
    setState('transcribing')
  })

  sidecar.on('transcript', ({ text, lang }) => {
    if (speechEndedAt !== null) {
      log(`[kira] local STT took ${Date.now() - speechEndedAt}ms`)
      speechEndedAt = null
    }
    // Serialized against other turns/announcements -- see turnChain --
    // rather than fired directly, so it can't interleave with a proactive
    // background-task announcement that's already mid-flight.
    serialize(() => handleTranscript(text, lang))
  })

  sidecar.on('audio', async ({ audioBase64, sampleRate }) => {
    log(`[kira] received utterance audio for Groq STT (${sampleRate}Hz)`)
    if (!sttEngine) {
      logError('[kira] stt.engine is groq but no STT engine was created')
      resetSession()
      setState('idle')
      return
    }
    // Unlike local Whisper (which transcribes inside the Python sidecar
    // before it ever reports back "idle"/wake-detectable again), Groq
    // transcription is a network call that happens here, *after* the
    // sidecar has already gone back to listening for "Kira". So this gen
    // must be captured before that await, not just inside handleTranscript
    // -- otherwise a new wake mid-transcription would make this stale
    // utterance's text get fed into the *new* session as if freshly said.
    const gen = sessionGuard.current()
    const sttStartedAt = Date.now()
    try {
      const wavBuffer = Buffer.from(audioBase64, 'base64')
      const { text, lang } = await sttEngine.transcribe(wavBuffer)
      log(`[kira] Groq STT took ${Date.now() - sttStartedAt}ms`)
      if (!sessionGuard.isCurrent(gen)) {
        log('[kira] dropping Groq transcript that arrived after its session was superseded')
        return
      }
      serialize(() => handleTranscript(text, lang))
    } catch (err) {
      logError('[kira] Groq STT failed:', (err as Error).message)
      if (sessionGuard.isCurrent(gen)) {
        resetSession()
        setState('idle')
      }
    }
  })

  sidecar.on('error', (err) => {
    logError('[kira] audio sidecar error:', err.message)
  })

  // Not awaited -- a timer that already elapsed while the app was closed
  // (or one that's still pending) shouldn't hold up startup; it announces
  // itself via announceProactively() as soon as it's restored/fires either
  // way. See tools/timers.ts.
  void restoreTimers((label, id) => {
    log(`[kira] timer #${id} fired`)
    announceProactively(label)
  })
  initSystemWatch((phrase, id) => {
    log(`[kira] system watch #${id} triggered`)
    announceProactively(phrase)
  })

  sidecar.start()

  registerHotkeys(config, {
    onMute: () => {
      log('[kira] mute hotkey pressed')
      interruptAndListen()
    },
    onDismiss: () => {
      log('[kira] dismiss hotkey pressed')
      resetSession()
      sidecar.abort()
      stopAudio()
      sidecar.notifyBusy(false) // see interruptAndListen()'s comment on why this doesn't happen implicitly
      setState('idle')
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow(config.overlay.accentColor)
  })

  app.on('before-quit', () => {
    unregisterHotkeys()
    sidecar.stop()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
