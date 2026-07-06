// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { NodeEnd, Payload } from './taxonomy'

/**
 * The declarative AnimationSpec — the single unifying abstraction of the whole
 * product. The engine interprets it to render an interaction's animation.
 *
 *   L1 presets  = AnimationSpec instances with a whitelist of `exposedParams`.
 *   L2 composer = a visual editor that emits an AnimationSpec.
 *   L3 plugins  = register the behavior/reaction/renderer names a spec references.
 *
 * One schema, three authoring altitudes. Built from three orthogonal axes:
 * payloads × behaviors × node reactions.
 */

export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

/** How sprites move along the edge over time. Open union → L3 plugins add more. */
export const BEHAVIORS = [
  'travel', // A → B once
  'accumulate', // travel then increment the target's level
  'drain', // decrement the source's level then travel
  'roundTrip', // out then back (optionally swapping payload)
  'stream', // continuous spawn
  'burst', // N at once
  'scatter', // random offsets / jitter
  'pulse', // a light pulse, no discrete sprite
] as const
export type BehaviorName = (typeof BEHAVIORS)[number] | (string & {})

/** What the endpoint nodes do. Open union → L3 plugins add more. */
export const REACTIONS = [
  'fill',
  'drain',
  'emit',
  'absorb',
  'flash',
  'vibrate',
  'glow',
] as const
export type ReactionEffect = (typeof REACTIONS)[number] | (string & {})

export type EmissionMode = 'continuous' | 'burst' | 'single'
export type ArriveEffect = 'increment' | 'decrement' | 'none'
export type ReactionTrigger = 'spawn' | 'arrive' | 'depart' | 'levelChange'

export interface PayloadSpec {
  sprite: Payload
  size: number
  colorToken: string
  count?: number
}

export interface EmissionSpec {
  mode: EmissionMode
  /** sprites per second at global speed = 1 */
  rate: number
  burstSize?: number
  jitter?: number
}

export interface BehaviorStep {
  behavior: BehaviorName
  from: NodeEnd
  to: NodeEnd
  durationMs: number
  easing?: Easing
  /** couples to the `to` node's level when the sprite arrives */
  onArrive?: ArriveEffect
  /** couples to the `from` node's level when the sprite departs (e.g. drain) */
  onDepart?: ArriveEffect
  /** level delta per arrival/departure (0..1) */
  amount?: number
  /** swap the payload sprite for the return leg of a roundTrip */
  returnSprite?: Payload
}

export interface ReactionSpec {
  node: NodeEnd
  effect: ReactionEffect
  on: ReactionTrigger
  intensityToken?: string
}

export interface TimingSpec {
  /** 'global' → durations/rates divide by the throughput slider */
  speedCoupling: 'global' | 'fixed'
  baseSpeed: number
  loop: boolean
}

export type ReducedMotionGlyph = 'arrow' | 'double-arrow' | 'fill-bar'
export interface ReducedMotionSpec {
  mode: 'static-indicator'
  glyph: ReducedMotionGlyph
}

export interface AnimationSpec {
  id: string
  version: 1
  payload: PayloadSpec
  emission: EmissionSpec
  behaviors: BehaviorStep[]
  reactions: ReactionSpec[]
  timing: TimingSpec
  reducedMotion: ReducedMotionSpec
  /** JSON-paths the L1 inspector may edit, e.g. "emission.rate". */
  exposedParams?: string[]
}
