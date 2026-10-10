// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { clockTime } from '../sim/profiles.ts'
import type { Frame, Simulation } from '../sim/runtime.ts'
import styles from './Transport.module.css'

const SPEEDS = [0.25, 1, 4] as const

/** play/pause, the time of day, and how fast it runs */
export function Transport({
  sim,
  frame,
  compact = false,
}: {
  sim: Simulation
  frame: Frame
  compact?: boolean
}) {
  return (
    <div className={compact ? `${styles.bar} ${styles.compact}` : styles.bar}>
      <button
        type="button"
        className={styles.play}
        onClick={() => sim.setPlaying(!sim.playing)}
        aria-label={sim.playing ? 'Pause' : 'Play'}
        title={sim.playing ? 'Pause (space)' : 'Play (space)'}
      >
        {sim.playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2 L14 8 L4 14 Z" />
          </svg>
        )}
      </button>

      <label className={styles.scrub}>
        <span className="sr-only">Time of day</span>
        <input
          type="range"
          min={0}
          max={24}
          step={0.05}
          value={frame.hour}
          onChange={(e) => sim.seek(Number(e.target.value))}
          aria-valuetext={clockTime(frame.hour)}
        />
      </label>
      <output className={styles.clock}>{clockTime(frame.hour)}</output>

      {!compact && (
        <div className={styles.speeds} role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={sim.speed === s ? styles.on : undefined}
              aria-pressed={sim.speed === s}
              onClick={() => sim.setSpeed(s)}
            >
              {s === 0.25 ? '¼×' : `${s}×`}
            </button>
          ))}
        </div>
      )}
      {!compact && (
        <button
          type="button"
          className={styles.reset}
          onClick={() => sim.reset()}
          title="Start the day over"
        >
          reset
        </button>
      )}
    </div>
  )
}
