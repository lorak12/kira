// Short, low-effort wake greetings -- said before any speech has been
// heard, so they stay generic and brief rather than presuming a task.
// No "sir"/formal titles: see personaPrompt.ts's notes on why.
const GREETINGS: Record<'en' | 'pl', string[]> = {
  en: [
    'At your service.',
    'What are we doing?',
    "I'm listening.",
    'Go ahead.',
    'Yes? What can I do for you?',
    "Here. What's up?"
  ],
  pl: [
    'Do usług.',
    'Słucham, w czym mogę pomóc?',
    'Jestem tu, mów śmiało.',
    'Tak, słucham?',
    'Czekam na polecenie.',
    'Jestem. O co chodzi?'
  ]
}

/**
 * Picks a random greeting for `lang`, from the built-in list plus any
 * `extra` lines configured for that language (`assistant.extraGreetings` in
 * kira.config.json) -- additive, not a replacement, so a user adding lines
 * for one language can't accidentally empty out another's.
 */
export function pickGreeting(lang: string, extra: Record<string, string[]> = {}): string {
  const builtin = lang === 'pl' ? GREETINGS.pl : GREETINGS.en
  const list = [...builtin, ...(extra[lang] ?? [])]
  return list[Math.floor(Math.random() * list.length)]
}
