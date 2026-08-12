/**
 * Tracks which "session" (wake-to-dismiss/silence/error span) is current, so
 * async work belonging to an abandoned one can detect that and bail out
 * instead of corrupting whatever superseded it.
 *
 * Why this exists: the audio sidecar returns to wake-word detection the
 * instant it finishes transcribing an utterance -- *before* Electron's
 * LLM/tool loop for that utterance has even started. Saying "Kira" again
 * while she's still working on the first request is therefore always
 * possible, not an edge case. Without a guard, the new session's
 * `resetSession()` wipes shared state (`history` etc.) out from under the
 * still-running old turn, which resumes after its next `await` and mutates
 * whatever's now in that state's place, or calls `speak()`/`setState()` and
 * steps on the new turn's audio.
 *
 * Usage: callers capture `guard.current()` when a turn starts, then check
 * `guard.isCurrent(gen)` after every `await` before touching shared state.
 * A new wake word (or dismiss/silence/error) calls `guard.next()`, which
 * invalidates every generation captured before it.
 */
export class SessionGuard {
  private generation = 0

  /** Starts a new generation, invalidating all previously captured ones. Returns it. */
  next(): number {
    this.generation += 1
    return this.generation
  }

  /** The generation currently in effect. */
  current(): number {
    return this.generation
  }

  /** Whether `gen` (captured earlier via `current()`) is still the live one. */
  isCurrent(gen: number): boolean {
    return gen === this.generation
  }
}
