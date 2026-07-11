// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { ChangeEvent } from 'react'
import { useRef } from 'react'

import { exportDiagramJson, importDiagramJson } from '../persistence'
import { useDiagramStore } from '../store/useDiagramStore'
import { useSimStore } from '../store/useSimStore'
import styles from './Toolbar.module.css'

/**
 * Canvas toolbar: the global throughput slider, level reset, and diagram
 * import/export/clear. Play/presentation land in M6.
 */
export function Toolbar() {
  const throughput = useSimStore((s) => s.throughput)
  const setThroughput = useSimStore((s) => s.setThroughput)
  const resetLevels = useSimStore((s) => s.resetLevels)
  const clear = useDiagramStore((s) => s.clear)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = () => {
    const blob = new Blob([exportDiagramJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'anigram.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void file.text().then((text) => importDiagramJson(text))
    e.target.value = ''
  }

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

      <span className={styles.divider} />

      <button type="button" className={styles.btn} onClick={resetLevels}>
        reset
      </button>
      <button type="button" className={styles.btn} onClick={doExport}>
        export
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={() => fileRef.current?.click()}
      >
        import
      </button>
      <button type="button" className={styles.btn} onClick={clear}>
        clear
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        onChange={onFile}
        hidden
      />
    </div>
  )
}
