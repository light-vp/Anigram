// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useSimStore } from '../store/useSimStore'
import styles from './Toolbar.module.css'

/**
 * Canvas toolbar. M3: the global throughput slider (retimes every animation) +
 * a reset. Play/presentation/import/export land in later milestones.
 */
export function Toolbar() {
  const throughput = useSimStore((s) => s.throughput)
  const setThroughput = useSimStore((s) => s.setThroughput)
  const resetLevels = useSimStore((s) => s.resetLevels)

  return (
    <div className={styles.toolbar}>
      <label className={styles.control}>
        <span className={styles.label}>throughput</span>
        <input
          type="range"
          min={0.1}
          max={4}
          step={0.1}
          value={throughput}
          onChange={(e) => setThroughput(Number.parseFloat(e.target.value))}
          className={styles.slider}
          aria-label="animation throughput"
        />
        <span className={styles.value}>{throughput.toFixed(1)}×</span>
      </label>
      <button type="button" className={styles.btn} onClick={resetLevels}>
        reset
      </button>
    </div>
  )
}
