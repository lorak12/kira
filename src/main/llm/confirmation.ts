// Lightweight yes/no detection for confirming risky tool calls (shutdown,
// restart, sleep, force-closing an app). Deliberately simple regex rather
// than another LLM round-trip -- confirmation needs to be fast and the
// vocabulary is small and closed.
// A trailing \b breaks on non-ASCII word chars like "ń" (JS regex \w is
// ASCII-only), so boundaries are a lookahead for "not another letter/digit"
// instead, with /u so \p{L} covers accented Polish letters too.
const AFFIRMATIVE =
  /^\s*(yes|yeah|yep|yup|sure|do it|go ahead|confirm(ed)?|ok(ay)?|correct|tak|zrób to|potwierdzam|jasne)(?![\p{L}\d])/iu
const NEGATIVE = /^\s*(no|nope|nah|don'?t|cancel|stop|nie|anuluj|przestań)(?![\p{L}\d])/iu

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE.test(text.trim())
}

export function isNegative(text: string): boolean {
  return NEGATIVE.test(text.trim())
}
