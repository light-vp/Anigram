// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import { useEffect } from 'react'
import type { DragEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useDiagramStore } from '../store/useDiagramStore'
import { useSimStore } from '../store/useSimStore'
import { AnimationOverlay } from './AnimationOverlay'
import styles from './DiagramCanvas.module.css'
import { LDEdgeView } from './LDEdge'
import { LDNodeView } from './LDNode'
import { PresentationBar } from './PresentationBar'
import { ScenePicker } from './ScenePicker'
import { Toolbar } from './Toolbar'

export const DND_MIME = 'application/ld-kind'

const nodeTypes = { ld: LDNodeView }
const edgeTypes = { ld: LDEdgeView }

function Flow() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    selectEdge,
  } = useDiagramStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      addNode: s.addNode,
      selectNode: s.selectNode,
      selectEdge: s.selectEdge,
    })),
  )
  const { screenToFlowPosition, fitView } = useReactFlow()
  const fitNonce = useSimStore((s) => s.fitNonce)

  useEffect(() => {
    fitView({ padding: 0.3, duration: 400, maxZoom: 1 })
  }, [fitNonce, fitView])

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const kindId = e.dataTransfer.getData(DND_MIME)
    if (!kindId) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(kindId, position)
  }

  return (
    <div className={styles.canvas} onDrop={onDrop} onDragOver={onDragOver}>
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

      <ScenePicker />
      <Toolbar />
      <PresentationBar />
    </div>
  )
}

/**
 * The React Flow canvas — a CONTROLLED component driven by useDiagramStore,
 * wrapped in a provider so the palette's drag-drop can project screen→flow
 * coordinates. The AnimationOverlay paints moving payloads imperatively on top.
 */
export function DiagramCanvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  )
}
