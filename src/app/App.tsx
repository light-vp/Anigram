// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { DiagramCanvas, getNodeKinds, Inspector, Palette } from '../engine'
import styles from './App.module.css'

/**
 * App shell: palette + canvas. Toolbar (M3), inspector (M4), scenes/presentation
 * (M6) slot in around this frame.
 */
export function App() {
  const kindCount = getNodeKinds().length

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>
          living<span className={styles.accent}>·</span>diagrams
        </h1>
        <p className={styles.status}>
          M4 · tune it live · {kindCount} kinds · select a connection to edit its
          animation
        </p>
      </header>

      <div className={styles.body}>
        <Palette />
        <DiagramCanvas />
        <Inspector />
      </div>
    </div>
  )
}
