import { useEffect, useRef } from 'react'
import type { PlayAudioPayload } from '@shared/ipc'

const AMPLITUDE_EVENT = 'kira-amplitude'

function dispatchAmplitude(value: number): void {
  window.dispatchEvent(new CustomEvent<number>(AMPLITUDE_EVENT, { detail: value }))
}

interface QueuedChunk {
  url: string
  isLast: boolean
}

/**
 * Owns TTS playback: plays audio pushed from the main process, analyses its
 * amplitude in real time for the orb's audio-reactivity, and reports back to
 * main when playback ends (so the state machine can return to idle) or gets
 * stopped early (the mute/interrupt path).
 *
 * A reply can arrive as multiple chunks (index.ts's speak() streams a long
 * reply sentence-by-sentence so playback starts before the whole thing is
 * synthesized -- see PlayAudioPayload.isLast) -- this queues them and plays
 * them back-to-back on the one shared <audio> element, only reporting
 * playback-ended once the chunk marked isLast has actually finished. A
 * normal one-chunk reply (most of them) is just a queue of length one and
 * behaves exactly as before.
 */
export default function AudioPlayer(): null {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const currentUrlRef = useRef<string | null>(null)
  const currentIsLastRef = useRef<boolean>(true)
  const queueRef = useRef<QueuedChunk[]>([])

  useEffect(() => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaElementSource(audio)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyser.connect(audioCtx.destination)
    audioCtxRef.current = audioCtx
    analyserRef.current = analyser

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    function tick(): void {
      const analyserNode = analyserRef.current
      if (analyserNode && audioRef.current && !audioRef.current.paused) {
        analyserNode.getByteTimeDomainData(dataArray)
        let sumSquares = 0
        for (let i = 0; i < dataArray.length; i++) {
          const centered = (dataArray[i] - 128) / 128
          sumSquares += centered * centered
        }
        const rms = Math.sqrt(sumSquares / dataArray.length)
        dispatchAmplitude(Math.min(1, rms * 3))
      } else {
        dispatchAmplitude(0)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    function cleanupUrl(): void {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
        currentUrlRef.current = null
      }
    }

    // Starts the next queued chunk if nothing is currently playing --
    // called both when a fresh chunk arrives (the very first chunk of a
    // reply, or one that arrived after the queue had already drained) and
    // when a chunk finishes (to advance to whatever's queued next).
    // No-ops harmlessly if audio is already playing or the queue is empty.
    function maybePlayNext(): void {
      if (!audio.paused) return
      const next = queueRef.current.shift()
      if (!next) return
      currentUrlRef.current = next.url
      currentIsLastRef.current = next.isLast
      audio.src = next.url
      audioCtx.resume().finally(() => audio.play().catch((err) => console.error('[kira] playback failed', err)))
    }

    function onEnded(): void {
      cleanupUrl()
      const wasLast = currentIsLastRef.current
      maybePlayNext()
      if (wasLast) {
        dispatchAmplitude(0)
        window.kira.notifyPlaybackEnded()
      }
      // If it wasn't the last chunk but nothing was queued yet, playback
      // just goes quiet for a beat until the next onPlayAudio arrives and
      // maybePlayNext() picks it straight up (audio.paused is true here).
    }
    audio.addEventListener('ended', onEnded)

    const offPlay = window.kira.onPlayAudio((payload: PlayAudioPayload) => {
      const bytes = Uint8Array.from(atob(payload.audioBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: payload.mimeType })
      const url = URL.createObjectURL(blob)
      queueRef.current.push({ url, isLast: payload.isLast })
      maybePlayNext()
    })

    const offStop = window.kira.onStopAudio(() => {
      audio.pause()
      audio.currentTime = 0
      for (const chunk of queueRef.current) URL.revokeObjectURL(chunk.url)
      queueRef.current = []
      dispatchAmplitude(0)
    })

    return () => {
      cancelAnimationFrame(rafRef.current)
      audio.removeEventListener('ended', onEnded)
      offPlay()
      offStop()
      for (const chunk of queueRef.current) URL.revokeObjectURL(chunk.url)
      queueRef.current = []
      cleanupUrl()
      audioCtx.close()
    }
  }, [])

  return null
}
