// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Affordance } from './affordance'

export type NodeCategory =
  | 'compute'
  | 'storage'
  | 'network'
  | 'data'
  | 'integration'

export interface NodeCapacity {
  max: number
  unit: string
  initial?: number
}

/** Nominative provider metadata — used to describe compatibility, never marks. */
export interface ProviderNames {
  aws?: string
  gcp?: string
  azure?: string
}

/**
 * A node KIND definition (declared by a pack). React Flow only ever sees one
 * node type, `ld`; the kind lives in `node.data.kindId`. The engine renders any
 * pack's kinds without knowing what they mean.
 */
export interface NodeKind {
  /** namespaced, e.g. "cloud.bucket" */
  id: string
  /** owning pack id, e.g. "cloud" */
  pack: string
  /** role-based label, e.g. "Object Storage" */
  label: string
  category: NodeCategory
  affordances: Affordance[]
  /** icon id resolved from the merged icon registry */
  icon: string
  /** a CSS var reference, e.g. "var(--kind-storage)" */
  accentToken: string
  /** only meaningful if affordances include store/cache */
  capacity?: NodeCapacity
  providers?: ProviderNames
}

/** Data attached to a React Flow node instance. */
export interface LDNodeData {
  kindId: string
  label?: string
  [key: string]: unknown
}
