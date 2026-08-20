import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

export interface ReflectionState {
  sessionsSinceReflection: number
}

const DEFAULT_STATE: ReflectionState = { sessionsSinceReflection: 0 }

export function reflectionStatePath(): string {
  return join(app.getPath('userData'), 'reflection-state.json')
}

export async function loadReflectionState(): Promise<ReflectionState> {
  try {
    const raw = await readFile(reflectionStatePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ReflectionState>
    if (typeof parsed.sessionsSinceReflection !== 'number') return { ...DEFAULT_STATE }
    return { sessionsSinceReflection: parsed.sessionsSinceReflection }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export async function saveReflectionState(state: ReflectionState): Promise<void> {
  const path = reflectionStatePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state), 'utf-8')
}
