#!/usr/bin/env node
// TTS model bake-off for Kira. See README.md.
//
//   node scripts/tts-bench/run.mjs
//
// Synthesizes every text in texts.mjs through every configured provider
// (providers.mjs, enabled by which API keys are set -- see .env.example;
// Edge is free and always enabled). Unlike the STT bench, there's no
// automatic scoring for TTS quality -- output is a report.html with an
// <audio> player per (text, provider) cell so you actually listen and judge.

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './loadEnv.mjs'
import { providers } from './providers.mjs'
import { texts } from './texts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv(path.join(__dirname, '.env'), path.join(__dirname, '..', 'stt-bench', '.env'))

const outputsDir = path.join(__dirname, 'outputs')
const resultsDir = path.join(__dirname, 'results')
mkdirSync(outputsDir, { recursive: true })
mkdirSync(resultsDir, { recursive: true })

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

async function main() {
  const active = providers.filter((p) => p.enabled())
  console.error(`Providers enabled: ${active.map((p) => p.id).join(', ')}`)

  // text id -> provider id -> { buffer, ext, latencyMs } | { error }
  const results = {}
  for (const { id: textId, text } of texts) {
    results[textId] = {}
    for (const provider of active) {
      process.stderr.write(`  ${textId} x ${provider.id} ... `)
      const start = Date.now()
      try {
        const { buffer, ext } = await provider.synthesize(text)
        const latencyMs = Date.now() - start
        const filename = `${textId}__${provider.id}.${ext}`
        writeFileSync(path.join(outputsDir, filename), buffer)
        results[textId][provider.id] = { filename, ext, latencyMs, bytes: buffer.length, buffer }
        console.error(`ok (${latencyMs}ms, ${(buffer.length / 1024).toFixed(0)}KB)`)
      } catch (err) {
        results[textId][provider.id] = { error: String(err?.message ?? err) }
        console.error(`FAILED: ${err?.message ?? err}`)
      }
    }
  }

  // Latency summary, ranked fastest first (quality is for you to judge by ear).
  const perProvider = {}
  for (const byProvider of Object.values(results)) {
    for (const [providerId, entry] of Object.entries(byProvider)) {
      perProvider[providerId] ??= { latencies: [], errors: 0, total: 0 }
      perProvider[providerId].total++
      if (entry.error) perProvider[providerId].errors++
      else perProvider[providerId].latencies.push(entry.latencyMs)
    }
  }
  const summary = Object.entries(perProvider)
    .map(([providerId, s]) => ({
      providerId,
      avgLatencyMs: s.latencies.length ? s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length : null,
      errors: s.errors,
      total: s.total
    }))
    .sort((a, b) => (a.avgLatencyMs ?? Infinity) - (b.avgLatencyMs ?? Infinity))

  console.error('\n=== Latency ranking (quality: listen to report.html) ===')
  for (const s of summary) {
    const lat = s.avgLatencyMs !== null ? `${Math.round(s.avgLatencyMs)}ms avg` : 'all failed'
    console.error(`${s.providerId.padEnd(32)} ${lat}${s.errors ? `  (${s.errors} errors)` : ''}`)
  }

  writeHtmlReport(results, summary, active, path.join(resultsDir, 'report.html'))
  console.error(`\nReport: ${path.join(resultsDir, 'report.html')}`)
}

function writeHtmlReport(results, summary, active, filePath) {
  const providerIds = active.map((p) => p.id)
  const providerLabels = Object.fromEntries(active.map((p) => [p.id, p.label]))

  const summaryRows = summary
    .map(
      (s) => `<tr>
        <td>${escapeHtml(providerLabels[s.providerId] ?? s.providerId)}</td>
        <td>${s.avgLatencyMs !== null ? Math.round(s.avgLatencyMs) + ' ms' : '—'}</td>
        <td>${s.errors}</td>
      </tr>`
    )
    .join('\n')

  const detailRows = Object.entries(results)
    .map(([textId, byProvider]) => {
      const cells = providerIds
        .map((pid) => {
          const e = byProvider[pid]
          if (!e) return '<td class="muted">—</td>'
          if (e.error) return `<td class="err">${escapeHtml(e.error)}</td>`
          const mime = e.ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
          const dataUri = `data:${mime};base64,${e.buffer.toString('base64')}`
          return `<td><audio controls src="${dataUri}"></audio><br><span class="meta">${e.latencyMs}ms · ${(e.bytes / 1024).toFixed(0)}KB</span></td>`
        })
        .join('\n')
      const text = texts.find((t) => t.id === textId)?.text ?? ''
      return `<tr><th class="textcell">${escapeHtml(textId)}<br><span class="meta">${escapeHtml(text)}</span></th>${cells}</tr>`
    })
    .join('\n')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Kira TTS Bench</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #111; color: #eee; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #333; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 13px; }
  th { background: #1c1c1c; }
  .textcell { white-space: normal; max-width: 220px; background: #1c1c1c; }
  .meta { color: #888; font-size: 11px; }
  .err { color: #ff6b6b; }
  .muted { color: #555; }
  audio { width: 220px; }
  h1, h2 { font-weight: 600; }
</style></head>
<body>
  <h1>Kira TTS Bench</h1>
  <h2>Latency (quality: listen below)</h2>
  <table>
    <tr><th>Provider</th><th>Avg latency</th><th>Errors</th></tr>
    ${summaryRows}
  </table>
  <h2>Listen &amp; compare</h2>
  <table>
    <tr><th>Text</th>${providerIds.map((p) => `<th>${escapeHtml(providerLabels[p] ?? p)}</th>`).join('')}</tr>
    ${detailRows}
  </table>
</body></html>`
  writeFileSync(filePath, html, 'utf8')
}

main()
