// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { CSSProperties } from 'react'

import { getIcon, getNodeKinds } from '../registry/packRegistry'
import { useDiagramStore } from '../store/useDiagramStore'
import styles from './Palette.module.css'

/**
 * The node palette, built from the registry so any pack's kinds appear here.
 * M2: click a kind to add it. Drag-drop placement + delete arrive in M5.
 */
export function Palette() {
  const kinds = getNodeKinds()
  const addNode = useDiagramStore((s) => s.addNode)

  return (
    <aside className={styles.palette}>
      <div className={styles.head}>Palette</div>
      <div className={styles.list}>
        {kinds.map((kind) => {
          const Icon = getIcon(kind.icon)
          return (
            <button
              key={kind.id}
              type="button"
              className={styles.item}
              onClick={() => addNode(kind.id)}
              style={{ '--accent': kind.accentToken } as CSSProperties}
              title={`Add ${kind.label}`}
            >
              <span className={styles.icon}>
                {Icon ? <Icon className={styles.glyph} /> : null}
              </span>
              <span className={styles.label}>{kind.label}</span>
            </button>
          )
        })}
      </div>
      <p className={styles.hint}>click to add · drag between nodes to connect</p>
    </aside>
  )
}
