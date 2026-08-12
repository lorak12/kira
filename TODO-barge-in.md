# Barge-in (interrupt Kira by just talking)

**Status:** implemented 2026-08-12, OFF by default, needs live tuning.

## What shipped

- `kira.config.json`'s new `bargeIn` section: `enabled` (default `false`),
  `rmsThreshold` (int16 RMS, default 1200), `minSpeechMs` (default 400).
  See `schema.ts` for the reasoning on each default.
- `audio_server.py`: tracks `self.kira_busy` (set via a new `kira_busy`
  WebSocket cmd from Electron -- true for the *entire* window from "user
  finished talking" through "she's done replying", covering thinking/tool
  calls, not just TTS playback) and, only while that's true and
  `--barge-in` was passed, runs a gap-tolerant RMS gate (`_check_barge_in`,
  same short-dip tolerance as the existing end-of-utterance VAD, so normal
  pauses between syllables don't reset progress) alongside the existing
  wake-word check. Sustained above-threshold audio for `minSpeechMs` emits
  a `barge_in` event. No AEC -- this is a plain energy gate, so it can and
  will false-trigger on Kira's own voice bleeding into the mic if the
  threshold is too low for your setup.
- `sidecarClient.ts`: `--barge-in`/`--barge-in-rms-threshold`/
  `--barge-in-min-speech-ms` CLI args (only passed when `bargeIn.enabled`),
  new `bargeIn` sidecar event, and `notifyBusy(busy)` sent at the start of
  "thinking" (`handleTranscript`/`announceIfIdle`) and at the start of
  `speak()` (belt-and-suspenders for paths that skip straight to speaking,
  e.g. the wake greeting) -- cleared on `PLAYBACK_ENDED`, the no_reply
  silent path, an LLM/announcement error, or any manual audio stop
  (`interruptAndListen()` in `index.ts`, plus the dismiss hotkey).
- `index.ts`: new shared `interruptAndListen()` (stop audio, keep the
  session, go straight to listening -- no wake word needed) used by the
  mute keyword, the mute hotkey, and the new `sidecar.on('bargeIn', ...)`
  handler. Saying "Kira" over her still works as an ordinary wake word too
  (the barge-in check falls through to it rather than replacing it).

## What still needs YOUR live tuning (can't be done blind, see below)

1. Set `bargeIn.enabled: true` in `kira.config.json` and restart.
2. Talk over Kira mid-reply. Watch the sidecar log for
   `barge-in detected (rms=...)` lines (or their absence).
3. **If she never interrupts:** `rmsThreshold` is too high for your mic's
   gain, or `minSpeechMs` is too long -- lower one or both.
4. **If she interrupts herself** (fires while she's talking and you're
   silent): `rmsThreshold` is too low for how loud her own TTS bleeds back
   into the mic at your speaker/headphone volume and mic distance --
   raise it, or switch to a headset mic that's physically isolated from
   playback (the only real fix; a plain RMS gate has no way to
   distinguish "the user talking" from "Kira's voice coming out of the
   speakers" otherwise).
5. Iterate `rmsThreshold`/`minSpeechMs` in `kira.config.json` (no rebuild
   needed, just restart) until the false-trigger rate and the miss rate
   both feel right for your room/mic.

This is exactly the tuning step flagged as unverifiable-from-here in the
original version of this doc -- nothing about that changed; only the
mechanism to tune now exists.
