// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

import type { LDEdge } from '../store/useDiagramStore'
import styles from './LDEdge.module.css'
import { VerbChip } from './VerbChip'

/**
 * The custom edge. It renders only the STATIC base path + arrowhead + the verb
 * chip — no moving sprites. Payload animation is a separate overlay layer (M3)
 * that reads this edge's geometry; keeping it out of React here is what lets the
 * animation run at 60fps without re-rendering the graph.
 */
export function LDEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps<LDEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={selected ? styles.selected : styles.edge}
      />
      {data?.interactionId ? (
        <EdgeLabelRenderer>
          <VerbChip interactionId={data.interactionId} x={labelX} y={labelY} />
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
