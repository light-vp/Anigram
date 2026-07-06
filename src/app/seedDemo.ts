// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Interaction, LDEdge, LDNode } from '../engine'
import { useDiagramStore } from '../engine'

/**
 * A demo diagram showing the three flagship semantic animations side by side:
 *   API → Uploads       upload   (the bucket fills)
 *   Archive → Thumbnail  download (the archive drains)
 *   API → Users DB       query    (a request round-trips)
 *
 * Lives in the app (not the engine) so the engine stays domain-agnostic.
 */
function edge(interactionId: string, source: string, target: string): LDEdge {
  return {
    id: `e-${interactionId}`,
    source,
    target,
    type: 'ld',
    markerEnd: 'url(#ld-arrow)',
    data: { interactionId },
  }
}

function interaction(
  id: string,
  from: string,
  to: string,
  verb: string,
  payload: string,
  specId: string,
): Interaction {
  return { id, from, to, verb, payload, direction: 'forward', specId, params: {}, resolved: true }
}

export function seedDemo(): void {
  const nodes: LDNode[] = [
    { id: 'n-api', type: 'ld', position: { x: 80, y: 250 }, data: { kindId: 'cloud.service', label: 'API' } },
    { id: 'n-bucket', type: 'ld', position: { x: 440, y: 110 }, data: { kindId: 'cloud.bucket', label: 'Uploads', level: 0 } },
    { id: 'n-db', type: 'ld', position: { x: 440, y: 400 }, data: { kindId: 'cloud.db', label: 'Users DB' } },
    { id: 'n-archive', type: 'ld', position: { x: 820, y: 400 }, data: { kindId: 'cloud.bucket', label: 'Archive', level: 1 } },
    { id: 'n-worker', type: 'ld', position: { x: 820, y: 110 }, data: { kindId: 'cloud.worker', label: 'Thumbnailer' } },
  ]

  const interactions: Record<string, Interaction> = {
    up: interaction('up', 'n-api', 'n-bucket', 'upload', 'file', 'cloud.upload.v1'),
    qr: interaction('qr', 'n-api', 'n-db', 'query', 'request', 'cloud.query.v1'),
    dl: interaction('dl', 'n-archive', 'n-worker', 'download', 'file', 'cloud.download.v1'),
  }

  const edges: LDEdge[] = [
    edge('up', 'n-api', 'n-bucket'),
    edge('qr', 'n-api', 'n-db'),
    edge('dl', 'n-archive', 'n-worker'),
  ]

  useDiagramStore.setState({ nodes, edges, interactions })
}
