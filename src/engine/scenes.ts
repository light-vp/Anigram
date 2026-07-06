// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getVerbDef } from './registry/packRegistry'
import type { LDEdge, LDNode } from './store/useDiagramStore'
import { useDiagramStore } from './store/useDiagramStore'
import { useSimStore } from './store/useSimStore'
import type { Interaction } from './types/interaction'
import type { Scene } from './types/pack'

/**
 * Loads a curated Scene into the diagram store, building interactions from the
 * scene's verbs (resolving payload/spec defaults from the verb registry). Then
 * asks the canvas to fit the view. Presentation is started separately.
 */
export function loadScene(scene: Scene): void {
  const nodes: LDNode[] = scene.nodes.map((n) => ({
    id: n.id,
    type: 'ld',
    position: n.position,
    data: { kindId: n.kind, label: n.label },
  }))

  const interactions: Record<string, Interaction> = {}
  const edges: LDEdge[] = []
  for (const e of scene.edges) {
    const verb = e.verb ?? 'stream'
    const def = getVerbDef(String(verb))
    interactions[e.id] = {
      id: e.id,
      from: e.source,
      to: e.target,
      verb,
      payload: def?.defaultPayload ?? 'packet',
      direction: e.direction ?? def?.defaultDirection ?? 'forward',
      specId: def?.defaultSpecId ?? '',
      params: {},
      resolved: true,
    }
    edges.push({
      id: `e-${e.id}`,
      source: e.source,
      target: e.target,
      type: 'ld',
      markerEnd: 'url(#ld-arrow)',
      data: { interactionId: e.id },
    })
  }

  useDiagramStore.setState({
    nodes,
    edges,
    interactions,
    selectedNodeId: null,
    selectedEdgeId: null,
  })
  useSimStore.getState().requestFit()
}
