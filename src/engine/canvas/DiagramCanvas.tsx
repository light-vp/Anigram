// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
} from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'

import { useDiagramStore } from '../store/useDiagramStore'
import { AnimationOverlay } from './AnimationOverlay'
import styles from './DiagramCanvas.module.css'
import { LDEdgeView } from './LDEdge'
import { LDNodeView } from './LDNode'
import { Toolbar } from './Toolbar'

const nodeTypes = { ld: LDNodeView }
const edgeTypes = { ld: LDEdgeView }

/**
 * The React Flow canvas — a CONTROLLED component driven by useDiagramStore. It
 * renders the static graph; the AnimationOverlay (a ViewportPortal child) paints
 * the moving payloads imperatively on top.
 */
export function DiagramCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    selectEdge,
  } = useDiagramStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      selectNode: s.selectNode,
      selectEdge: s.selectEdge,
    })),
  )

  return (
    <div className={styles.canvas}>
      {/* Arrowhead marker, coloured from a token so it stays theme-driven. */}
      <svg className={styles.defs} aria-hidden="true">
        <defs>
          <marker
            id="ld-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path className={styles.arrow} d="M0 0 L8 4 L0 8 z" />
          </marker>
        </defs>
      </svg>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => selectNode(null)}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{ type: 'ld', markerEnd: 'url(#ld-arrow)' }}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.3}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} />
        <AnimationOverlay />
      </ReactFlow>

      <Toolbar />
    </div>
  )
}
