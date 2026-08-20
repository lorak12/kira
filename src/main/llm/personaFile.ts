import { readFileSync, existsSync } from 'fs'
import { personaPath } from '../config/configStore'

export interface PersonaSections {
  coreIdentity: string | null
  style: string | null
  expectations: string | null
  /** Any other `## Heading` section, passed through verbatim so the file can grow without code changes. */
  extra: Array<{ heading: string; body: string }>
}

const EMPTY_SECTIONS: PersonaSections = { coreIdentity: null, style: null, expectations: null, extra: [] }

const KNOWN_HEADINGS: Record<string, keyof Pick<PersonaSections, 'coreIdentity' | 'style' | 'expectations'>> = {
  'core identity': 'coreIdentity',
  style: 'style',
  expectations: 'expectations'
}

/**
 * Splits a kira.persona.md-shaped markdown string on `## Heading` lines.
 * Known headings (matched case-insensitively) populate the named fields;
 * anything else -- including a top-level `# Title` line, which is just
 * ignored -- lands in `extra` verbatim. Pure/testable, no fs access.
 */
export function parsePersonaMarkdown(raw: string): PersonaSections {
  const sections: PersonaSections = { coreIdentity: null, style: null, expectations: null, extra: [] }

  const headingRe = /^##\s+(.+?)\s*$/gm
  const matches = [...raw.matchAll(headingRe)]
  if (!matches.length) return sections

  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1]
    const bodyStart = (matches[i].index ?? 0) + matches[i][0].length
    const bodyEnd = i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length
    const body = raw.slice(bodyStart, bodyEnd).trim()
    if (!body) continue

    const key = KNOWN_HEADINGS[heading.trim().toLowerCase()]
    if (key) {
      sections[key] = body
    } else {
      sections.extra.push({ heading: heading.trim(), body })
    }
  }

  return sections
}

let cachedPersona: PersonaSections | null = null

/**
 * Reads and parses kira.persona.md (see personaPath()), caching the result
 * for the process lifetime -- same no-live-reload philosophy as
 * configStore.ts's loadConfig(), restart to pick up edits. If the file
 * doesn't exist or can't be read, returns EMPTY_SECTIONS so
 * personaPrompt.ts falls back to its own hardcoded default identity --
 * a user who never creates the file gets today's exact unchanged behavior.
 */
export function loadPersona(): PersonaSections {
  if (cachedPersona) return cachedPersona

  const path = personaPath()
  if (!existsSync(path)) {
    cachedPersona = EMPTY_SECTIONS
    return cachedPersona
  }

  try {
    const raw = readFileSync(path, 'utf-8')
    cachedPersona = parsePersonaMarkdown(raw)
  } catch (err) {
    console.warn(`[kira] couldn't read persona file at ${path}, using built-in default:`, (err as Error).message)
    cachedPersona = EMPTY_SECTIONS
  }
  return cachedPersona
}
