// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

import { registerNodeFill, registerNodeRoot } from '../animation/nodeElements'
import { cx } from '../lib/cx'
import { getIcon, getNodeKind } from '../registry/packRegistry'
import type { LDNode } from '../store/useDiagramStore'
import { hasLevel } from '../types/affordance'
import styles from './LDNode.module.css'

/**
 * The single custom node. The level track's fill element registers with the
 * animation scheduler, which sets its height imperatively — so a filling bucket
 * never triggers a React re-render.
 */
export function LDNodeView({ id, data, selected }: NodeProps<LDNode>) {
  const kind = getNodeKind(data.kindId)
  if (!kind) {
    return <div className={cx(styles.node, styles.unknown)}>?</div>
  }

  const Icon = getIcon(kind.icon)
  const showLevel = hasLevel(kind.affordances)

  return (
    <div
      className={cx(styles.node, selected && styles.selected)}
      style={{ '--accent': kind.accentToken } as CSSProperties}
      ref={(el) => registerNodeRoot(id, el)}
    >
      <Handle type="source" position={Position.Left} id="left" className={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" className={styles.handle} />
      <Handle type="source" position={Position.Top} id="top" className={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={styles.handle} />

      <span className={styles.icon}>
        {Icon ? <Icon className={styles.glyph} /> : null}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{data.label ?? kind.label}</span>
        <span className={styles.kind}>{kind.label}</span>
      </span>

      {showLevel ? (
        <span className={styles.levelTrack} aria-hidden="true">
          <span
            className={styles.levelFill}
            ref={(el) => registerNodeFill(id, el)}
          />
        </span>
      ) : null}
    </div>
  )
}
