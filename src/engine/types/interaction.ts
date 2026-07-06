// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Direction, Payload, Verb } from './taxonomy'

export type { Verb, Payload, Direction } from './taxonomy'
export type { AnimationSpec } from './animationSpec'

/**
 * L1 authoring overrides, keyed by JSON-path into the AnimationSpec
 * (e.g. "emission.rate", "behaviors.0.amount"). Shallow-merged onto the base
 * spec at interpret time, so the base spec is never mutated and "reset to
 * default" is trivial.
 */
export type InteractionParams = Record<string, unknown>

/**
 * The Interaction is the product's atom: a typed, animated link between two
 * typed nodes. `edge.data` only carries a pointer ({ interactionId }); the full
 * Interaction lives in the diagram store keyed by id, so the animation layer can
 * read it without going through React Flow's edge array.
 */
export interface Interaction {
  id: string
  from: string
  to: string
  verb: Verb
  payload: Payload
  direction: Direction
  /** the resolved/authored spec id (looked up in the registry) */
  specId: string
  /** L1 param overrides layered onto the base spec */
  params: InteractionParams
  /** true if auto-resolved, false once the user overrode the verb/animation */
  resolved: boolean
}

/** The thin pointer stored on a React Flow edge. */
export interface LDEdgeData {
  interactionId: string
  [key: string]: unknown
}

/** A candidate interaction produced by the resolver, best-first. */
export interface InteractionCandidate {
  verb: Verb
  payload: Payload
  direction: Direction
  specId: string
  label: string
  score: number
}
