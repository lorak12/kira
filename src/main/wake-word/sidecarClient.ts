import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { app } from 'electron'
import { isAbsolute, join } from 'path'
import WebSocket from 'ws'
import type { KiraConfig } from '../config/schema'
import { log } from '../logger'

// Resolves config-file-relative paths (python interpreter, wake-word model
// files) against the project root, not the built main-process bundle's
// __dirname -- the Python sidecar source and .onnx models never get copied
// into out/main during a build. Bare commands like "python" (no path
// separator, meant to be resolved via PATH) are left untouched.
function resolveFromAppRoot(path: string): string {
  if (isAbsolute(path) || !/[\\/]/.test(path)) return path
  return join(app.getAppPath(), path)
}

interface SidecarEvents {
  wake: []
  mute: []
  bargeIn: []
  speechEnd: []
  transcript: [{ text: string; lang: string }]
  audio: [{ audioBase64: string; sampleRate: number }]
  error: [Error]
}

/**
 * Spawns the Python audio sidecar (openWakeWord + faster-whisper, owns the
 * mic) and bridges its WebSocket event stream into typed Node EventEmitter
 * events. One long-lived process/connection per app run.
 */
export class SidecarClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null
  private ws: WebSocket | null = null
  private config: KiraConfig
  private stopped = false

  constructor(config: KiraConfig) {
    super()
    this.config = config
  }

  start(): void {
    const sidecarDir = join(app.getAppPath(), 'src/main/pySidecar')
    const args = [
      join(sidecarDir, 'audio_server.py'),
      '--port',
      String(this.config.sidecar.port),
      '--ww-model',
      resolveFromAppRoot(this.config.wakeWord.modelPath),
      '--threshold',
      String(this.config.wakeWord.threshold),
      '--stt-engine',
      this.config.stt.engine === 'groq' ? 'groq' : 'local',
      '--whisper-model-size',
      this.config.stt.localWhisper.modelSize
    ]
    if (this.config.stt.language) {
      args.push('--language', this.config.stt.language)
    }
    if (this.config.wakeWord.muteModelPath) {
      args.push('--mute-model', resolveFromAppRoot(this.config.wakeWord.muteModelPath))
    }
    if (this.config.bargeIn.enabled) {
      args.push(
        '--barge-in',
        '--barge-in-rms-threshold',
        String(this.config.bargeIn.rmsThreshold),
        '--barge-in-min-speech-ms',
        String(this.config.bargeIn.minSpeechMs)
      )
    }

    const pythonPath = resolveFromAppRoot(this.config.sidecar.pythonPath)
    this.process = spawn(pythonPath, args, { cwd: sidecarDir })

    this.process.stdout.on('data', (d) => process.stdout.write(`[sidecar:out] ${d}`))
    this.process.stderr.on('data', (d) => process.stderr.write(`[sidecar] ${d}`))
    this.process.on('exit', (code) => {
      log(`[kira] audio sidecar exited with code ${code}`)
    })
    this.process.on('error', (err) => this.emit('error', err))

    this.connectWebSocket()
  }

  private connectWebSocket(attempt = 0): void {
    const url = `ws://127.0.0.1:${this.config.sidecar.port}`
    const ws = new WebSocket(url)

    ws.on('open', () => {
      log('[kira] connected to audio sidecar')
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        this.handleMessage(msg)
      } catch (err) {
        this.emit('error', err as Error)
      }
    })

    ws.on('close', () => {
      if (this.stopped) return
      // Loading ML models (especially a large Whisper model on first run,
      // when weights still need to download) can take well over a minute
      // before the sidecar's WebSocket server comes up. Keep retrying as
      // long as the process is still alive rather than giving up on a fixed
      // budget -- giving up early silently deafens the app to a sidecar
      // that's still starting.
      if (this.process?.exitCode !== null && this.process?.exitCode !== undefined) {
        this.emit('error', new Error(`Audio sidecar process exited (code ${this.process.exitCode}), not retrying`))
        return
      }
      const delay = Math.min(500 * 2 ** Math.min(attempt, 4), 5000)
      if (attempt > 0 && attempt % 10 === 0) {
        log(`[kira] still waiting for audio sidecar to come up (attempt ${attempt})...`)
      }
      setTimeout(() => this.connectWebSocket(attempt + 1), delay)
    })

    ws.on('error', () => {
      // 'close' fires right after; retry handled there.
    })

    this.ws = ws
  }

  private handleMessage(msg: { type: string; [key: string]: unknown }): void {
    switch (msg.type) {
      case 'wake':
        this.emit('wake')
        break
      case 'mute':
        this.emit('mute')
        break
      case 'barge_in':
        this.emit('bargeIn')
        break
      case 'speech_end':
        this.emit('speechEnd')
        break
      case 'transcript':
        this.emit('transcript', { text: msg.text as string, lang: msg.lang as string })
        break
      case 'audio':
        this.emit('audio', { audioBase64: msg.audio as string, sampleRate: msg.sampleRate as number })
        break
    }
  }

  abort(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ cmd: 'abort' }))
    }
  }

  // Tells the sidecar to begin capturing the user's command now -- sent
  // after a greeting or reply finishes playing, so mic capture never
  // overlaps with Kira's own TTS output.
  startListening(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ cmd: 'start_listening' }))
    }
  }

  // Tells the sidecar whether Kira is currently "busy" -- thinking (running
  // the LLM/tool loop) or actually talking -- so its barge-in RMS check
  // (only meaningful during that window) knows when to run. Covers thinking
  // too, not just TTS playback, so you can interrupt her before she's even
  // started replying instead of having to wait for her to speak first. See
  // config.bargeIn and audio_server.py's kira_busy handling.
  notifyBusy(busy: boolean): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ cmd: 'kira_busy', busy }))
    }
  }

  stop(): void {
    this.stopped = true
    this.ws?.close()
    this.process?.kill()
  }
}

export interface SidecarClient {
  on<E extends keyof SidecarEvents>(event: E, listener: (...args: SidecarEvents[E]) => void): this
  emit<E extends keyof SidecarEvents>(event: E, ...args: SidecarEvents[E]): boolean
}
