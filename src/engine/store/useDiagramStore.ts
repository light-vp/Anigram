// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react'
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  XYPosition,
} from '@xyflow/react'
import { nanoid } from 'nanoid'
import { create } from 'zustand'

import { getNodeKind, getVerbDef } from '../registry/packRegistry'
import { genericCandidate, resolveInteraction } from '../resolver/resolveInteraction'
import type { Interaction, LDEdgeData, Verb } from '../types/interaction'
import type { LDNodeData } from '../types/node'

export type LDNode = Node<LDNodeData, 'ld'>
export type LDEdge = Edge<LDEdgeData, 'ld'>

/**
 * The diagram store is the single source of truth. React Flow is a CONTROLLED
 * component: it reads nodes/edges from here and reports changes back through
 * onNodesChange/onEdgesChange. The full Interaction objects live here keyed by
 * id; edges only carry a { interactionId } pointer.
 */
export interface DiagramState {
  nodes: LDNode[]
  edges: LDEdge[]
  interactions: Record<string, Interaction>
  selectedNodeId: string | null
  selectedEdgeId: string | null

  onNodesChange: (changes: NodeChange<LDNode>[]) => void
  onEdgesChange: (changes: EdgeChange<LDEdge>[]) => void
  onConnect: (connection: Connection) => void

  addNode: (kindId: string, position?: XYPosition) => void
  setInteractionVerb: (interactionId: string, verb: Verb) => void
  setInteractionParam: (
    interactionId: string,
    path: string,
    value: unknown,
  ) => void
  resetInteractionParams: (interactionId: string) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  deleteSelected: () => void
  clear: () => void
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  // The engine store starts empty and domain-agnostic; the app seeds a demo
  // diagram (or a scene loads) after packs are registered.
  nodes: [],
  edges: [],
  interactions: {},
  selectedNodeId: null,
  selectedEdgeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  onEdgesChange: (changes) => {
    const removedIds = changes
      .filter((c) => c.type === 'remove')
      .map((c) => c.id)
    let interactions = get().interactions
    if (removedIds.length > 0) {
      interactions = { ...interactions }
      for (const edgeId of removedIds) {
        const edge = get().edges.find((e) => e.id === edgeId)
        const iid = edge?.data?.interactionId
        if (iid) delete interactions[iid]
      }
    }
    set({ edges: applyEdgeChanges(changes, get().edges), interactions })
  },

  onConnect: (connection) => {
    const { source, target } = connection
    if (!source || !target || source === target) return

    const nodes = get().nodes
    const sourceNode = nodes.find((n) => n.id === source)
    const targetNode = nodes.find((n) => n.id === target)
    const sourceKind = sourceNode
      ? getNodeKind(sourceNode.data.kindId)
      : undefined
    const targetKind = targetNode
      ? getNodeKind(targetNode.data.kindId)
      : undefined

    let candidate = genericCandidate()
    if (sourceKind && targetKind) {
      candidate = resolveInteraction(sourceKind, targetKind)[0] ?? candidate
    }

    const interactionId = nanoid(8)
    const interaction: Interaction = {
      id: interactionId,
      from: source,
      to: target,
      verb: candidate.verb,
      payload: candidate.payload,
      direction: candidate.direction,
      specId: candidate.specId,
      params: {},
      resolved: true,
    }
    const edge: LDEdge = {
      id: `e-${interactionId}`,
      source,
      target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
      type: 'ld',
      markerEnd: 'url(#ld-arrow)',
      data: { interactionId },
    }

    set({
      interactions: { ...get().interactions, [interactionId]: interaction },
      edges: addEdge(edge, get().edges),
    })
  },

  addNode: (kindId, position) => {
    if (!getNodeKind(kindId)) return
    const count = get().nodes.length
    const pos: XYPosition = position ?? {
      x: 160 + (count % 4) * 200,
      y: 120 + Math.floor(count / 4) * 150,
    }
    const node: LDNode = {
      id: nanoid(8),
      type: 'ld',
      position: pos,
      data: { kindId },
    }
    set({ nodes: [...get().nodes, node] })
  },

  setInteractionVerb: (interactionId, verb) => {
    const interaction = get().interactions[interactionId]
    if (!interaction) return
    const def = getVerbDef(String(verb))
    const updated: Interaction = {
      ...interaction,
      verb,
      payload: def?.defaultPayload ?? interaction.payload,
      specId: def?.defaultSpecId ?? '',
      direction: def?.defaultDirection ?? interaction.direction,
      params: {},
      resolved: false,
    }
    set({
      interactions: { ...get().interactions, [interactionId]: updated },
    })
  },

  setInteractionParam: (interactionId, path, value) => {
    const interaction = get().interactions[interactionId]
    if (!interaction) return
    set({
      interactions: {
        ...get().interactions,
        [interactionId]: {
          ...interaction,
          params: { ...interaction.params, [path]: value },
        },
      },
    })
  },

  resetInteractionParams: (interactionId) => {
    const interaction = get().interactions[interactionId]
    if (!interaction) return
    set({
      interactions: {
        ...get().interactions,
        [interactionId]: { ...interaction, params: {} },
      },
    })
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  deleteSelected: () => {
    const { selectedNodeId, selectedEdgeId, nodes, edges, interactions } = get()

    if (selectedEdgeId) {
      const edge = edges.find((e) => e.id === selectedEdgeId)
      const next = { ...interactions }
      if (edge?.data?.interactionId) delete next[edge.data.interactionId]
      set({
        edges: edges.filter((e) => e.id !== selectedEdgeId),
        interactions: next,
        selectedEdgeId: null,
      })
      return
    }

    if (selectedNodeId) {
      const removed = edges.filter(
        (e) => e.source === selectedNodeId || e.target === selectedNodeId,
      )
      const next = { ...interactions }
      for (const e of removed) {
        if (e.data?.interactionId) delete next[e.data.interactionId]
      }
      set({
        nodes: nodes.filter((n) => n.id !== selectedNodeId),
        edges: edges.filter(
          (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
        ),
        interactions: next,
        selectedNodeId: null,
      })
    }
  },

  clear: () =>
    set({
      nodes: [],
      edges: [],
      interactions: {},
      selectedNodeId: null,
      selectedEdgeId: null,
    }),
}))
