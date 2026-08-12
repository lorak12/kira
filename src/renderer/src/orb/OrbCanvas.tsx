import { useEffect, useRef } from 'react'
import { vertexShaderSrc, fragmentShaderSrc } from './metaballShader'
import { STATE_STYLE, type OrbStyle } from './stateStyle'
import type { KiraState } from '@shared/ipc'

interface OrbCanvasProps {
  state: KiraState
  accentColor: string
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const r = parseInt(m.substring(0, 2), 16) / 255
  const g = parseInt(m.substring(2, 4), 16) / 255
  const b = parseInt(m.substring(4, 6), 16) / 255
  return [r, g, b]
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }
  return shader
}

// The audio-reactivity wiring (task: ElevenLabs TTS + playback) dispatches
// `kira-amplitude` CustomEvents with a 0..1 RMS value; this component only
// needs to listen, keeping orb rendering decoupled from the audio pipeline.
const AMPLITUDE_EVENT = 'kira-amplitude'

export default function OrbCanvas({ state, accentColor }: OrbCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const amplitudeRef = useRef(0)
  const stateRef = useRef<KiraState>(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const onAmplitude = (e: Event): void => {
      const detail = (e as CustomEvent<number>).detail
      amplitudeRef.current = detail
    }
    window.addEventListener(AMPLITUDE_EVENT, onAmplitude)
    return () => window.removeEventListener(AMPLITUDE_EVENT, onAmplitude)
  }, [])

  useEffect(() => {
    // When not actively speaking, amplitude decays to 0 for the idle pulse.
    if (state !== 'speaking') amplitudeRef.current = 0
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
    if (!gl) {
      console.error('WebGL2 not available for orb rendering')
      return
    }

    const program = gl.createProgram()!
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexShaderSrc))
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`)
    }
    gl.useProgram(program)

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const u_resolution = gl.getUniformLocation(program, 'u_resolution')
    const u_time = gl.getUniformLocation(program, 'u_time')
    const u_amplitude = gl.getUniformLocation(program, 'u_amplitude')
    const u_color = gl.getUniformLocation(program, 'u_color')
    const u_pulseSpeed = gl.getUniformLocation(program, 'u_pulseSpeed')
    const u_glow = gl.getUniformLocation(program, 'u_glow')

    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const [accentR, accentG, accentB] = hexToRgb(accentColor)
    let smoothedAmplitude = 0
    const current: OrbStyle = { ...STATE_STYLE.idle }
    let raf = 0
    const start = performance.now()

    function resize(): void {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.round(canvas!.clientWidth * dpr)
      const height = Math.round(canvas!.clientHeight * dpr)
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width
        canvas!.height = height
        gl!.viewport(0, 0, width, height)
      }
    }

    function render(now: number): void {
      resize()
      smoothedAmplitude += (amplitudeRef.current - smoothedAmplitude) * 0.2

      const target = STATE_STYLE[stateRef.current]
      const lerpFactor = 0.08
      current.pulseSpeed += (target.pulseSpeed - current.pulseSpeed) * lerpFactor
      current.glow += (target.glow - current.glow) * lerpFactor
      current.whiteMix += (target.whiteMix - current.whiteMix) * lerpFactor

      const r = accentR + (1 - accentR) * current.whiteMix
      const g = accentG + (1 - accentG) * current.whiteMix
      const b = accentB + (1 - accentB) * current.whiteMix

      gl!.uniform2f(u_resolution, canvas!.width, canvas!.height)
      gl!.uniform1f(u_time, (now - start) / 1000)
      gl!.uniform1f(u_amplitude, smoothedAmplitude)
      gl!.uniform3f(u_color, r, g, b)
      gl!.uniform1f(u_pulseSpeed, current.pulseSpeed)
      gl!.uniform1f(u_glow, current.glow)

      gl!.clearColor(0, 0, 0, 0)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.drawArrays(gl!.TRIANGLES, 0, 6)

      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    return () => cancelAnimationFrame(raf)
  }, [accentColor])

  return <canvas ref={canvasRef} className="orb-canvas" />
}
