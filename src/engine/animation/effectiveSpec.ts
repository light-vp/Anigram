// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getSpec } from '../registry/packRegistry'
import type { AnimationSpec } from '../types/animationSpec'
import type { Interaction } from '../types/interaction'

/** Read a dotted JSON path (numeric segments index arrays). */
export function getAtPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function setAtPath(root: unknown, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: unknown = root
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return
    cur = (cur as Record<string, unknown>)[keys[i]!]
  }
  if (cur != null && typeof cur === 'object') {
    ;(cur as Record<string, unknown>)[keys[keys.length - 1]!] = value
  }
}

/**
 * The base AnimationSpec with the interaction's L1 param overrides merged in.
 * The base spec is never mutated (overrides apply to a clone), so "reset to
 * default" is just clearing params. This is what the scheduler interprets.
 */
export function effectiveSpec(
  interaction: Interaction,
): AnimationSpec | undefined {
  const base = getSpec(interaction.specId)
  if (!base) return undefined
  const params = interaction.params
  if (!params || Object.keys(params).length === 0) return base
  const clone = structuredClone(base)
  for (const [path, value] of Object.entries(params)) {
    setAtPath(clone, path, value)
  }
  return clone
}
