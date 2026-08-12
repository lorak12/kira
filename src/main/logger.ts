// Timestamped stand-ins for console.log/console.error, shared by every
// main-process module. Plain console.log gave no way to tell how long a
// turn actually took (wake word -> transcript -> reply) from the dev-server
// log, which is exactly what you need when something feels slow (e.g.
// diagnosing whisper "medium" transcription latency on CPU).
export function log(...args: unknown[]): void {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

export function logError(...args: unknown[]): void {
  console.error(`[${new Date().toISOString()}]`, ...args)
}
