// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { ComponentType } from 'react'
import type { Affordance } from './affordance'
import type { AnimationSpec } from './animationSpec'
import type { NodeKind } from './node'
import type { Direction, Payload, Verb } from './taxonomy'

/**
 * A Pack supplies everything domain-specific AS DATA. The engine merges it via
 * registerPack() and never imports a pack directly. The cloud pack is the first.
 */

export interface IconProps {
  className?: string
}
export type GlyphComponent = ComponentType<IconProps>

/** A node-kind glyph. */
export interface IconDef {
  id: string
  Component: GlyphComponent
}

/** A moving-payload sprite glyph. */
export interface SpriteDef {
  id: string
  Component: GlyphComponent
}

export interface VerbDef {
  verb: Verb
  label: string
  defaultPayload: Payload
  defaultSpecId: string
  defaultDirection?: Direction
}

/** Explicit kind→kind rule (most specific). */
export interface KindPairRule {
  match: 'kindPair'
  source: string
  target: string
  verb: Verb
  payload?: Payload
  direction?: Direction
  specId?: string
  label?: string
}

/** Affordance→affordance fallback rule. */
export interface AffordancePairRule {
  match: 'affordancePair'
  source: Affordance
  target: Affordance
  verb: Verb
  payload?: Payload
  direction?: Direction
  specId?: string
  label?: string
}

export type ResolverRule = KindPairRule | AffordancePairRule

export interface ThemeDefinition {
  id: string
  name: string
  tokens: Record<string, string>
}

/* ---- Scenes (curated diagrams; consumed in M6) ---- */

export interface ScenePosition {
  x: number
  y: number
}
export interface SceneNode {
  id: string
  kind: string
  position: ScenePosition
  label?: string
}
export interface SceneEdge {
  id: string
  source: string
  target: string
  verb?: Verb
  direction?: Direction
  label?: string
}
export interface SimStep {
  caption: string
  activateNodes?: string[]
  activateEdges?: string[]
  errorNodes?: string[]
  errorEdges?: string[]
  holdMs?: number
}
export interface Scene {
  id: string
  title: string
  description: string
  nodes: SceneNode[]
  edges: SceneEdge[]
  sequence: SimStep[]
  entryNodeId: string
}

export interface PackMeta {
  license: string
  trademarkNotice?: string
}

export interface Pack {
  id: string
  name: string
  version: string
  nodeKinds: NodeKind[]
  verbs?: VerbDef[]
  resolverRules?: ResolverRule[]
  payloadSprites?: SpriteDef[]
  animationPresets?: AnimationSpec[]
  icons?: IconDef[]
  themes?: ThemeDefinition[]
  scenes?: Scene[]
  meta: PackMeta
}
