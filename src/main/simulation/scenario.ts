import type { FakeSidecarClient } from './fakeSidecar'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function banner(text: string): void {
  console.log(`\n\x1b[35m▶ [SIM] ${text}\x1b[0m`)
}

/**
 * Feeds one scripted line in as if the user had said it: mirrors the real
 * sidecar's message order (speech_end, then transcript) so index.ts's
 * handling is exercised exactly as it would be live. Then waits for the
 * turn to actually finish (state back at 'listening') before returning,
 * rather than guessing at LLM/TTS latency with a fixed sleep -- real
 * round-trips vary enough (a few seconds to well over ten) that a fixed
 * delay either stalls the demo or queues lines faster than Kira can get
 * through them.
 */
async function say(sidecar: FakeSidecarClient, text: string, lang = 'en'): Promise<void> {
  banner(`user says: "${text}"`)
  sidecar.emit('speechEnd')
  await sleep(250)
  const untilNextTurn = sidecar.waitForState('listening', 30_000)
  sidecar.emit('transcript', { text, lang })
  await untilNextTurn
}

/**
 * Scripted walkthrough of the multitasking + turn-shaping features (see the
 * kira-turn-concurrency memory): a slow "research" tool that backgrounds
 * itself, ordinary fast tool calls running while it's still going, a live
 * status check mid-task, Kira reporting the result unprompted once it
 * finishes, a mute-style interruption mid-speech that does NOT end the
 * session, a real wake-word interruption mid-speech that DOES start a new
 * session (abandoning whatever was in flight, background task included),
 * and finally an explicit "thanks, that's enough" that ends the
 * conversation and cancels a background task still running under it.
 *
 * Every beat here drives the real pipeline in index.ts -- real LLM calls,
 * real tool execution, real TTS, real overlay/activity-panel IPC. Only the
 * "ears" (wake word + STT) are faked, via FakeSidecarClient. Kira's own
 * decisions (whether to speak, what to say, whether a reply counts as
 * no_reply-worthy, whether to even call research_project) are NOT scripted
 * -- that's the real agent loop, live, so the script phrases requests
 * directively enough that she has what she needs to just act rather than
 * ask a clarifying question first.
 */
export async function runMultitaskDemo(sidecar: FakeSidecarClient): Promise<void> {
  await sleep(1500)
  banner('==== ACT 1: multitasking + a background task that finishes on its own ====')
  banner('wake word')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000) // let the greeting play out

  await say(
    sidecar,
    "Kira, do a deep feasibility assessment of turning this project into a mobile app -- go ahead and research it now based on what you already know, I don't need to explain further, just think it over and give me your honest take when it's ready."
  )

  await say(sidecar, 'Also, open my jarvis project for me.')
  await say(sidecar, 'Skip this song.')
  await say(sidecar, "How's that research coming along?")
  await say(sidecar, 'Play something more upbeat instead.')

  banner('waiting for the background research to finish on its own, so she reports it UNPROMPTED...')
  banner('...then interrupting HER mid-sentence with a mute (does not end the session)')
  await sidecar.waitForState('speaking', 30_000)
  await sleep(700)
  banner('simulated mute keyword/hotkey -- cutting her off mid-sentence')
  sidecar.emit('mute')
  await sleep(1500)

  await say(sidecar, 'Sorry -- go on, what did you find?')

  banner('==== ACT 2: a real wake-word interruption mid-reply, then ending the conversation ====')
  banner('user says: "Kira, can you also research whether the backend could handle way more users, think it over?"')
  sidecar.emit('speechEnd')
  await sleep(250)
  sidecar.emit('transcript', {
    text: "Kira, can you also research whether the backend could handle way more users -- same deal, just go ahead and look into it, think it over.",
    lang: 'en'
  })

  banner('waiting for her to start replying, then interrupting with the WAKE WORD itself...')
  banner('(starts a brand-new session -- abandons this reply AND the new background task)')
  await sidecar.waitForState('speaking', 30_000)
  await sleep(600)
  banner('simulated wake word -- "Kira" said again mid-reply')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000) // let the fresh greeting play out

  // Not say() here -- end_conversation lands the state on 'idle', not
  // 'listening' (the session is over, so there's no next line to wait for).
  banner('user says: "Actually, never mind -- thanks, that\'s enough for now."')
  sidecar.emit('speechEnd')
  await sleep(250)
  const untilIdle = sidecar.waitForState('idle', 30_000)
  sidecar.emit('transcript', { text: "Actually, never mind -- thanks, that's enough for now.", lang: 'en' })
  await untilIdle

  await sleep(1500)
  banner('==== scenario finished -- overlay should be back to idle ====')
}

/**
 * Short, focused check for the "what else might the assistant need" batch
 * (spoken/persistent timers, streamed multi-sentence TTS, active-window
 * awareness) -- much faster than runMultitaskDemo, since those features
 * don't need the full multitask/interruption story to verify. Selected via
 * KIRA_SIM=timers (see index.ts).
 */
export async function runTimerCheckDemo(sidecar: FakeSidecarClient): Promise<void> {
  await sleep(1500)
  banner('==== timer/streaming-TTS check ====')
  banner('wake word')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000)

  await say(sidecar, 'Kira, set a timer for 8 seconds, call it "tea".')

  await say(sidecar, "What's the current active window? Also give me a couple-sentence, genuinely long-winded take on whether pineapple belongs on pizza -- I want to hear multiple sentences back to back.")

  banner('waiting for the 8s timer to fire on its own and interrupt her listening loop, unprompted...')
  const untilTimerAnnouncement = sidecar.waitForState('speaking', 20_000)
  await sleep(1000)
  await untilTimerAnnouncement

  banner('user says nothing further -- letting silence end the session naturally')
  await sleep(2000)
  sidecar.emit('speechEnd')
  sidecar.emit('transcript', { text: '', lang: 'en' })

  await sleep(2000)
  banner('==== scenario finished ====')
}

async function endSessionOnSilence(sidecar: FakeSidecarClient): Promise<void> {
  await sleep(1500)
  sidecar.emit('speechEnd')
  sidecar.emit('transcript', { text: '', lang: 'en' })
  await sleep(1200)
}

/**
 * Short check for the second follow-up batch: read_file (via the new
 * open_project "path" action fix), watch_system_metric, and an
 * absolute-time (atIso) reminder. Each check is its own isolated wake ->
 * ask -> silence mini-session so one going sideways can't derail the
 * others via shared history -- learned that the hard way running this
 * batch as one long conversation the first time. Selected via
 * KIRA_SIM=tools (see index.ts).
 */
export async function runToolsCheckDemo(sidecar: FakeSidecarClient): Promise<void> {
  await sleep(1500)
  banner('==== new-tools check: read_file (project path fix) / watch_system_metric / atIso ====')

  banner('---- check 1: read_file via open_project path resolution ----')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000)
  await say(
    sidecar,
    "Kira, read the file TODO-barge-in.md in my jarvis project and tell me, in your own words, what it's a reminder about. Resolve the project's real path first if you need to."
  )
  await endSessionOnSilence(sidecar)

  banner('---- check 2: watch_system_metric (should trigger almost immediately -- disk is nowhere near 1,000,000 GB free) ----')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000)
  await say(sidecar, 'Kira, watch free disk space and let me know if it ever goes below one million gigabytes.')
  await sleep(3000) // give the async immediate-check + proactive announcement a moment to land
  await endSessionOnSilence(sidecar)

  banner('---- check 3: absolute-time (atIso) reminder ----')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000)
  await say(
    sidecar,
    'Set a timer for 90 seconds from now using an absolute date-time, not a duration -- check the current time first if you need to, and call it "check-in".'
  )
  await endSessionOnSilence(sidecar)

  banner('==== scenario finished ====')
}

/**
 * Short check for the configurability round: wit/verbosity/extraGreetings/
 * tools.disabled/edge prosody, all set via a temporary kira.config.json
 * edit (see the session that wrote this). Selected via KIRA_SIM=config.
 */
export async function runConfigCheckDemo(sidecar: FakeSidecarClient): Promise<void> {
  await sleep(1500)
  banner('==== config check: wit=low verbosity=terse, read_webpage disabled, edge rate +30% ====')
  sidecar.emit('wake')
  await sidecar.waitForState('listening', 15_000)

  await say(sidecar, 'Kira, what do you think of pineapple on pizza? Give me your honest take.')
  await say(sidecar, 'Kira, read https://example.com and tell me what it says.')

  await endSessionOnSilence(sidecar)
  banner('==== scenario finished ====')
}
