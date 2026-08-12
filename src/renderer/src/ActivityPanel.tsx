import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ActivityEntry } from '@shared/ipc'

interface ActivityPanelProps {
  visible: boolean
  accentColor: string
  style: CSSProperties
}

const MAX_ENTRIES = 8

const KIND_PREFIX: Record<ActivityEntry['kind'], string> = {
  user: '›',
  tool: '▸',
  reply: '«'
}

// Glanceable "what is Kira actually doing" readout for a second monitor --
// what was said, which tools ran and what they returned, what she replied.
// Deliberately terse and capped (see MAX_ENTRIES / truncate() at the main
// process call sites) so it reads as useful signal, not a debug firehose.
export default function ActivityPanel({ visible, accentColor, style }: ActivityPanelProps): JSX.Element | null {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offActivity = window.kira.onActivity((entry) => {
      setEntries((prev) => [...prev, entry].slice(-MAX_ENTRIES))
    })
    const offReset = window.kira.onActivityReset(() => setEntries([]))
    return () => {
      offActivity()
      offReset()
    }
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries])

  if (!entries.length) return null

  return (
    <div
      className={`activity-panel ${visible ? 'visible' : ''}`}
      style={{ ...style, '--kira-chip-accent': accentColor } as CSSProperties}
    >
      <div className="activity-panel-header">
        <span className="activity-panel-dot" />
        <span>Kira</span>
      </div>
      <div className="activity-panel-list" ref={listRef}>
        {entries.map((entry) => (
          <div key={entry.id} className={`activity-line activity-line-${entry.kind}`}>
            <span className="activity-line-prefix">{KIND_PREFIX[entry.kind]}</span>
            <span className="activity-line-text">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
