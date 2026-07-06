// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getNodeKinds, isPackRegistered } from '../engine'
import { DevKindGrid } from './DevKindGrid'
import styles from './App.module.css'

/**
 * App shell. M1 proves the engine↔pack pipeline by rendering the cloud pack's
 * node kinds straight from the registry. The React Flow canvas, palette,
 * toolbar, and inspector are wired in later milestones (M2+).
 */
export function App() {
  const cloudOk = isPackRegistered('cloud')
  const count = getNodeKinds().length

  return (
    <div className={`${styles.shell} ld-grid-bg`}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>
          living<span className={styles.accent}>·</span>diagrams
        </h1>
        <p className={styles.status}>
          M1 · cloud pack {cloudOk ? 'registered' : 'MISSING'} · {count} node
          kinds
        </p>
      </header>

      <main className={styles.main}>
        <p className={styles.hint}>
          These kinds are loaded from the cloud pack as data — the engine renders
          them without knowing what a bucket or a CDN is. The canvas lands in M2.
        </p>
        <DevKindGrid />
      </main>
    </div>
  )
}
