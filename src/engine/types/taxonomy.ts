// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/**
 * The verb + payload taxonomies. Both are OPEN string unions
 * (`Core… | (string & {})`) so a pack or plugin can add a new verb/payload
 * without a core release, while editors still autocomplete the built-ins.
 */

/** Semantic label for an interaction; each maps to a default behavior chain. */
export const CORE_VERBS = [
  'upload',
  'download',
  'read',
  'write',
  'query',
  'publish',
  'subscribe',
  'consume',
  'replicate',
  'stream',
  'invoke',
  'sync',
  'notify',
  'cache',
] as const

export type CoreVerb = (typeof CORE_VERBS)[number]
export type Verb = CoreVerb | (string & {})

/** The thing that moves along the edge — the animated sprite. */
export const CORE_PAYLOADS = [
  'file',
  'record',
  'packet',
  'event',
  'request',
  'response',
  'message',
  'blob',
  'token',
  'frame',
] as const

export type CorePayload = (typeof CORE_PAYLOADS)[number]
export type Payload = CorePayload | (string & {})

export type Direction = 'forward' | 'reverse' | 'bidirectional'

/** Which end of an edge a behavior/reaction refers to. */
export type NodeEnd = 'source' | 'target'
