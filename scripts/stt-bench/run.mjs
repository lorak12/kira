#!/usr/bin/env node
// STT model bake-off for Kira. See README.md.
//
//   node scripts/stt-bench/run.mjs [--local] [--sizes tiny,base,small,medium,large-v3]
//
// Reads every clips/*.wav, runs it through every configured cloud STT
// provider (providers.mjs, enabled by which API keys are set -- see
// .env.example) and, with --local, also through faster-whisper at the given
// sizes via local_whisper.py (same engine/venv the production sidecar uses).
// If clips/<name>.txt exists, it's treated as the ground-truth transcript
// and scored with word error rate; otherwise only latency + the raw text
// are reported for eyeballing.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './loadEnv.mjs'
import { providers } from './providers.mjs'
import { wordErrorRate } from './wer.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv(path.join(__dirname, '.env'))

const args = process.argv.slice(2)
const runLocal = args.includes('--local')
const sizesArg = args.find((a) => a.startsWith('--sizes='))
const localSizes = sizesArg ? sizesArg.split('=')[1] : 'small,medium,large-v3'
const languageArg = args.find((a) => a.startsWith('--language='))
const language = languageArg ? languageArg.split('=')[1] : undefined

const clipsDir = path.join(__dirname, 'clips')
const resultsDir = path.join(__dirname, 'results')

function loadClips() {
  if (!existsSync(clipsDir)) {
    console.error(`No clips/ dir at ${clipsDir}`)
    process.exit(1)
  }
  const wavFiles = readdirSync(clipsDir).filter((f) => f.toLowerCase().endsWith('.wav'))
  if (wavFiles.length === 0) {
    console.error(`No .wav clips found in ${clipsDir} -- record some first (see README.md).`)
    process.exit(1)
  }
  return wavFiles.map((filename) => {
    const refPath = path.join(clipsDir, filename.replace(/\.wav$/i, '.txt'))
    return {
      filename,
      buffer: readFileSync(path.join(clipsDir, filename)),
      reference: existsSync(refPath) ? readFileSync(refPath, 'utf8').trim() : null
    }
  })
}

// clip filename -> provider id -> { text, latencyMs, wer, error }
async function runCloudProviders(clips) {
  const active = providers.filter((p) => p.enabled())
  if (active.length === 0) {
    console.error('No cloud STT providers enabled -- set API keys in scripts/stt-bench/.env (see .env.example).')
  } else {
    console.error(`Cloud providers enabled: ${active.map((p) => p.id).join(', ')}`)
  }

  const rows = {}
  for (const clip of clips) {
    rows[clip.filename] = {}
    for (const provider of active) {
      process.stderr.write(`  ${clip.filename} x ${provider.id} ... `)
      const start = Date.now()
      try {
        const { text } = await provider.transcribe(clip.buffer, clip.filename, { language })
        const latencyMs = Date.now() - start
        const entry = { text, latencyMs }
        if (clip.reference) Object.assign(entry, wordErrorRate(clip.reference, text))
        rows[clip.filename][provider.id] = entry
        console.error(`ok (${latencyMs}ms)`)
      } catch (err) {
        rows[clip.filename][provider.id] = { error: String(err?.message ?? err) }
        console.error(`FAILED: ${err?.message ?? err}`)
      }
    }
  }
  return rows
}

function runLocalWhisper(clips) {
  const venvPython = path.join(__dirname, '..', '..', 'src', 'main', 'pySidecar', '.venv', 'Scripts', 'python.exe')
  if (!existsSync(venvPython)) {
    console.error(`No venv python at ${venvPython} -- skipping local faster-whisper sizes.`)
    return {}
  }
  console.error(`Running local faster-whisper sizes: ${localSizes} (this loads each model, can take a while) ...`)
  const scriptArgs = ['local_whisper.py', '--clips-dir', clipsDir, '--sizes', localSizes]
  if (language) scriptArgs.push('--language', language)
  const proc = spawnSync(venvPython, scriptArgs, { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (proc.stderr) process.stderr.write(proc.stderr)
  if (proc.status !== 0) {
    console.error(`local_whisper.py exited with ${proc.status}`)
    return {}
  }
  const bySize = JSON.parse(proc.stdout.trim().split('\n').pop())

  const rows = {}
  const refByFilename = Object.fromEntries(clips.map((c) => [c.filename, c.reference]))
  for (const [providerId, perClip] of Object.entries(bySize)) {
    for (const [filename, { text, latencyMs }] of Object.entries(perClip)) {
      rows[filename] ??= {}
      const entry = { text, latencyMs }
      const reference = refByFilename[filename]
      if (reference) Object.assign(entry, wordErrorRate(reference, text))
      rows[filename][providerId] = entry
    }
  }
  return rows
}

function mergeResults(...resultSets) {
  const merged = {}
  for (const set of resultSets) {
    for (const [filename, byProvider] of Object.entries(set)) {
      merged[filename] ??= {}
      Object.assign(merged[filename], byProvider)
    }
  }
  return merged
}

function summarize(results) {
  const perProvider = {}
  for (const byProvider of Object.values(results)) {
    for (const [providerId, entry] of Object.entries(byProvider)) {
      perProvider[providerId] ??= { latencies: [], wers: [], errors: 0, total: 0 }
      const s = perProvider[providerId]
      s.total++
      if (entry.error) {
        s.errors++
        continue
      }
      s.latencies.push(entry.latencyMs)
      if (typeof entry.wer === 'number') s.wers.push(entry.wer)
    }
  }
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
  return Object.entries(perProvider)
    .map(([providerId, s]) => ({
      providerId,
      avgLatencyMs: avg(s.latencies),
      avgWer: avg(s.wers),
      scoredClips: s.wers.length,
      errors: s.errors,
      total: s.total
    }))
    .sort((a, b) => {
      // Rank by WER when we have ground truth for anything; else by latency.
      if (a.avgWer !== null && b.avgWer !== null) return a.avgWer - b.avgWer
      if (a.avgWer !== null) return -1
      if (b.avgWer !== null) return 1
      return (a.avgLatencyMs ?? Infinity) - (b.avgLatencyMs ?? Infinity)
    })
}

function writeCsv(results, filePath) {
  const lines = ['clip,provider,text,latency_ms,wer_percent,error']
  for (const [filename, byProvider] of Object.entries(results)) {
    for (const [providerId, entry] of Object.entries(byProvider)) {
      const text = (entry.text ?? '').replace(/"/g, '""')
      const wer = typeof entry.wer === 'number' ? (entry.wer * 100).toFixed(1) : ''
      const err = (entry.error ?? '').replace(/"/g, '""')
      lines.push(
        `"${filename}","${providerId}","${text}",${entry.latencyMs ?? ''},${wer},"${err}"`
      )
    }
  }
  writeFileSync(filePath, lines.join('\n'), 'utf8')
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function writeHtmlReport(results, summary, filePath) {
  const providerIds = summary.map((s) => s.providerId)
  const clipNames = Object.keys(results).sort()

  const summaryRows = summary
    .map(
      (s) => `<tr>
        <td>${escapeHtml(s.providerId)}</td>
        <td>${s.avgWer !== null ? (s.avgWer * 100).toFixed(1) + '%' : '—'}</td>
        <td>${s.avgLatencyMs !== null ? Math.round(s.avgLatencyMs) + ' ms' : '—'}</td>
        <td>${s.scoredClips}/${s.total}</td>
        <td>${s.errors}</td>
      </tr>`
    )
    .join('\n')

  const detailRows = clipNames
    .map((filename) => {
      const byProvider = results[filename]
      const cells = providerIds
        .map((pid) => {
          const e = byProvider[pid]
          if (!e) return '<td class="muted">—</td>'
          if (e.error) return `<td class="err">${escapeHtml(e.error)}</td>`
          const wer = typeof e.wer === 'number' ? `<span class="wer">${(e.wer * 100).toFixed(1)}% WER</span>` : ''
          return `<td>${escapeHtml(e.text)}<br><span class="meta">${e.latencyMs}ms ${wer}</span></td>`
        })
        .join('\n')
      return `<tr><th class="clipname">${escapeHtml(filename)}</th>${cells}</tr>`
    })
    .join('\n')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Kira STT Bench</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #111; color: #eee; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #333; padding: 6px 10px; text-align: left; vertical-align: top; font-size: 13px; }
  th { background: #1c1c1c; }
  .clipname { white-space: nowrap; background: #1c1c1c; }
  .meta { color: #888; font-size: 11px; }
  .wer { color: #ffb454; }
  .err { color: #ff6b6b; }
  .muted { color: #555; }
  h1, h2 { font-weight: 600; }
</style></head>
<body>
  <h1>Kira STT Bench</h1>
  <h2>Summary (ranked)</h2>
  <table>
    <tr><th>Provider</th><th>Avg WER</th><th>Avg latency</th><th>Scored clips</th><th>Errors</th></tr>
    ${summaryRows}
  </table>
  <h2>Per-clip transcripts</h2>
  <table>
    <tr><th>Clip</th>${providerIds.map((p) => `<th>${escapeHtml(p)}</th>`).join('')}</tr>
    ${detailRows}
  </table>
</body></html>`
  writeFileSync(filePath, html, 'utf8')
}

async function main() {
  const clips = loadClips()
  console.error(`Loaded ${clips.length} clip(s) from ${clipsDir}`)

  const cloudResults = await runCloudProviders(clips)
  const localResults = runLocal ? runLocalWhisper(clips) : {}
  const results = mergeResults(cloudResults, localResults)
  const summary = summarize(results)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(path.join(resultsDir, `results-${stamp}.json`), JSON.stringify({ results, summary }, null, 2))
  writeCsv(results, path.join(resultsDir, `results-${stamp}.csv`))
  writeHtmlReport(results, summary, path.join(resultsDir, 'report.html'))

  console.error('\n=== Ranking ===')
  for (const s of summary) {
    const wer = s.avgWer !== null ? `${(s.avgWer * 100).toFixed(1)}% WER` : 'no reference transcripts'
    const lat = s.avgLatencyMs !== null ? `${Math.round(s.avgLatencyMs)}ms avg` : ''
    console.error(`${s.providerId.padEnd(32)} ${wer.padEnd(24)} ${lat}${s.errors ? `  (${s.errors} errors)` : ''}`)
  }
  console.error(`\nReport: ${path.join(resultsDir, 'report.html')}`)
}

main()
