// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getIcon, getNodeKinds } from '../engine'
import styles from './DevKindGrid.module.css'

/**
 * TEMPORARY M1 view: renders every registered node kind straight from the
 * registry, proving the engine renders a pack's data without knowing what the
 * kinds mean. Replaced by the real canvas + palette in M2.
 */
export function DevKindGrid() {
  const kinds = getNodeKinds()

  return (
    <div className={styles.grid}>
      {kinds.map((kind) => {
        const Icon = getIcon(kind.icon)
        const provider = kind.providers?.aws
        return (
          <article key={kind.id} className={styles.card}>
            <span className={styles.icon} style={{ color: kind.accentToken }}>
              {Icon ? <Icon className={styles.glyph} /> : null}
            </span>
            <div className={styles.body}>
              <h3 className={styles.label}>{kind.label}</h3>
              <p className={styles.meta}>
                <span className={styles.cat}>{kind.category}</span>
                {provider ? <span className={styles.prov}>{provider}</span> : null}
              </p>
              <div className={styles.affs}>
                {kind.affordances.map((aff) => (
                  <span key={aff} className={styles.aff}>
                    {aff}
                  </span>
                ))}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
