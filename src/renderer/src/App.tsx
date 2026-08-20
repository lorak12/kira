import { useEffect, useRef, useState, type CSSProperties } from 'react'
import OrbCanvas from './orb/OrbCanvas'
import AudioPlayer from './AudioPlayer'
import ActivityPanel from './ActivityPanel'
import { STATE_INTENSITY, STATE_LABEL } from './orb/stateStyle'
import type { DisplayBoundsPayload, KiraState } from '@shared/ipc'

interface Display {
  x: number
  y: number
  width: number
  height: number
}

// How long the overlay stays visible after returning to idle before fading
// out, so a quick follow-up ("and what about...") doesn't need a fresh wake.
const IDLE_FADE_DELAY_MS = 1500

export default function App(): JSX.Element {
  const [displays, setDisplays] = useState<Display[]>([])
  const [primaryDisplay, setPrimaryDisplay] = useState<Display | null>(null)
  const [accentColor, setAccentColor] = useState('#8b5cf6')
  const [state, setState] = useState<KiraState>('idle')
  const [visible, setVisible] = useState(false)
  const orbHitRef = useRef<HTMLDivElement>(null)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const applyBounds = (payload: DisplayBoundsPayload): void => {
      setDisplays(payload.displays)
      setPrimaryDisplay(payload.primaryDisplay)
      setAccentColor(payload.accentColor)
    }
    // Pull the current bounds immediately -- don't rely solely on the main
    // process's one-shot push, which can fire before this listener exists.
    void window.kira.getDisplayBounds().then(applyBounds)
    const offBounds = window.kira.onDisplayBounds(applyBounds)
    const offState = window.kira.onStateChanged((s) => setState(s))
    return () => {
      offBounds()
      offState()
    }
  }, [])

  useEffect(() => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current)
      fadeTimeoutRef.current = null
    }

    if (state === 'idle') {
      fadeTimeoutRef.current = setTimeout(() => setVisible(false), IDLE_FADE_DELAY_MS)
    } else {
      setVisible(true)
    }
  }, [state])

  // The orb hit-region stays mounted through the fade-out transition (so the
  // orb can animate away), but once it's actually invisible it must stop
  // accepting mouse input -- otherwise its 340px hot zone, centered on the
  // primary display, sits directly over a game's crosshair and silently
  // flips the whole desktop-spanning overlay out of click-through the
  // instant the cursor passes through screen center. Force a reset here
  // rather than relying on onMouseLeave, since the cursor may already be
  // sitting inside the region when it fades out (no leave event fires).
  useEffect(() => {
    if (!visible) {
      window.kira.setIgnoreMouse(true)
    }
  }, [visible])

  // Union bounds define this window's own coordinate origin — offset each
  // display's absolute desktop bounds into window-local coordinates.
  const originX = displays.length ? Math.min(...displays.map((d) => d.x)) : 0
  const originY = displays.length ? Math.min(...displays.map((d) => d.y)) : 0

  const orbCenter = primaryDisplay
    ? {
        left: primaryDisplay.x - originX + primaryDisplay.width / 2,
        top: primaryDisplay.y - originY + primaryDisplay.height / 2
      }
    : null

  // Any display that isn't the primary one -- the activity panel anchors to
  // its bottom-right corner so it never shares the screen the user is
  // actually looking at (and orb) with the primary display's HUD.
  const secondaryDisplay = primaryDisplay
    ? displays.find((d) => d.x !== primaryDisplay.x || d.y !== primaryDisplay.y)
    : undefined
  const ACTIVITY_MARGIN = 28
  const activityStyle: CSSProperties | null = secondaryDisplay
    ? {
        left: secondaryDisplay.x - originX + secondaryDisplay.width - 380 - ACTIVITY_MARGIN,
        top: secondaryDisplay.y - originY + secondaryDisplay.height - 220 - ACTIVITY_MARGIN
      }
    : null

  const intensity = STATE_INTENSITY[state]

  return (
    <div className="overlay-root">
      <AudioPlayer />
      <div className={`overlay-content ${visible ? 'visible' : ''}`}>
        {displays.map((d, i) => (
          <div
            key={i}
            className="perimeter-frame"
            style={{
              left: d.x - originX,
              top: d.y - originY,
              width: d.width,
              height: d.height,
              boxShadow: `inset 0 0 90px 10px ${accentColor}55, inset 0 0 20px 2px ${accentColor}aa`
            }}
          >
            <div
              className="scan-line"
              style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
            />
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
              <div
                key={corner}
                className={`corner-bracket corner-${corner}`}
                style={{ borderColor: accentColor, opacity: 0.35 + intensity * 0.45 }}
              />
            ))}
          </div>
        ))}

        {orbCenter && (
          <div
            ref={orbHitRef}
            className="orb-hit-region"
            data-state={state}
            style={{
              left: orbCenter.left,
              top: orbCenter.top,
              pointerEvents: visible ? 'auto' : 'none'
            }}
            onMouseEnter={() => visible && window.kira.setIgnoreMouse(false)}
            onMouseLeave={() => window.kira.setIgnoreMouse(true)}
          >
            <div
              className="orb-halo"
              style={{
                background: `radial-gradient(circle, ${accentColor}99 0%, ${accentColor}33 45%, transparent 72%)`
              }}
            />
            <OrbCanvas state={state} accentColor={accentColor} />
            {STATE_LABEL[state] && (
              <div className="state-chip" style={{ '--kira-chip-accent': accentColor } as CSSProperties}>
                <span className="state-chip-dot" />
                <span className="state-chip-label">{STATE_LABEL[state]}</span>
              </div>
            )}
          </div>
        )}

        {activityStyle && <ActivityPanel visible={visible} accentColor={accentColor} style={activityStyle} />}
      </div>
    </div>
  )
}
