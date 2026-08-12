// Thin fetch wrapper -- the one seam network-backed tools call through, so
// tests can `vi.mock('./http')` instead of mocking global fetch everywhere.
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Request to ${new URL(url).host} failed (${res.status}).`)
  }
  return (await res.json()) as T
}

/** Same seam, for a tool that wants raw text/HTML back rather than JSON (see tools/webRead.ts). */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Request to ${new URL(url).host} failed (${res.status}).`)
  }
  return res.text()
}
