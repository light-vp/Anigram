// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/**
 * Affordances are the verbs a node KIND can participate in. They are the join
 * key the default-link resolver uses: it keys on (source affordances × target
 * affordances), so a new pack that declares emit→store inherits the "upload"
 * default without touching resolver code.
 *
 * Keep this set small and orthogonal.
 *
 * `store` / `cache` are special: they imply the node carries a `level` (0..1)
 * that behaviors can fill/drain — the hook that makes "the bucket fills"
 * first-class rather than bespoke.
 */
export const AFFORDANCES = [
  'emit', // originates payloads (Service, Client)
  'consume', // terminates/absorbs payloads (Worker, Sink)
  'store', // accumulates + drainable; has a level (Bucket, Volume)
  'serve', // responds to requests; round-trip counterpart (API, DB)
  'process', // transforms in-flight (ETL, Filter)
  'route', // fans in/out without terminating (Gateway, Queue, Mesh)
  'cache', // store + serve with hit/miss (CDN, Redis)
] as const

export type Affordance = (typeof AFFORDANCES)[number]

/** Affordances that give a node a fillable `level`. */
export const LEVELED_AFFORDANCES: readonly Affordance[] = ['store', 'cache']

export function hasLevel(affordances: readonly Affordance[]): boolean {
  return affordances.some((a) => LEVELED_AFFORDANCES.includes(a))
}
