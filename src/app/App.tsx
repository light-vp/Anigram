// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import styles from './App.module.css'

/**
 * App shell. For M0 this is an empty themed canvas that proves the design
 * tokens + build pipeline. The React Flow canvas, toolbar, palette, and
 * inspector are wired in later milestones (M2+).
 */
export function App() {
  return (
    <div className={`${styles.shell} ld-grid-bg`}>
      <div className={styles.center}>
        <h1 className={styles.wordmark}>
          living<span className={styles.accent}>·</span>diagrams
        </h1>
        <p className={styles.tagline}>
          architecture diagrams that come alive — the connection is the meaning.
        </p>
        <p className={styles.hint}>engine scaffold ready · canvas lands in M2</p>
      </div>
    </div>
  )
}
