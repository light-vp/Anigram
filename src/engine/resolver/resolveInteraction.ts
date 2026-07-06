// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getResolverRules } from '../registry/packRegistry'
import type { InteractionCandidate } from '../types/interaction'
import type { NodeKind } from '../types/node'
import type { ResolverRule } from '../types/pack'

/**
 * The default-link resolver. Given two node kinds, it returns ranked candidate
 * interactions (best first), two-tier / most-specific-wins:
 *   1. kind-pair rules  (explicit source→target kind) — highest score
 *   2. affordance-pair rules (source affordance → target affordance) — fallback
 *
 * Rules are pure data supplied by packs; this function is the mechanism only.
 */

function ruleToCandidate(rule: ResolverRule, score: number): InteractionCandidate {
  return {
    verb: rule.verb,
    payload: rule.payload ?? 'packet',
    direction: rule.direction ?? 'forward',
    specId: rule.specId ?? '',
    label: rule.label ?? String(rule.verb),
    score,
  }
}

export function resolveInteraction(
  source: NodeKind,
  target: NodeKind,
): InteractionCandidate[] {
  const rules = getResolverRules()
  const sourceAffs = new Set(source.affordances)
  const targetAffs = new Set(target.affordances)

  const matches: InteractionCandidate[] = []
  rules.forEach((rule, index) => {
    if (rule.match === 'kindPair') {
      if (rule.source === source.id && rule.target === target.id) {
        matches.push(ruleToCandidate(rule, 1000 - index))
      }
    } else if (sourceAffs.has(rule.source) && targetAffs.has(rule.target)) {
      matches.push(ruleToCandidate(rule, 500 - index))
    }
  })

  // Dedupe by verb, keeping the highest-scoring rule for each.
  const byVerb = new Map<string, InteractionCandidate>()
  for (const candidate of matches) {
    const key = String(candidate.verb)
    const existing = byVerb.get(key)
    if (!existing || candidate.score > existing.score) {
      byVerb.set(key, candidate)
    }
  }

  return [...byVerb.values()].sort((a, b) => b.score - a.score)
}

/** A neutral fallback when no rule matches, so an edge can always be created. */
export function genericCandidate(): InteractionCandidate {
  return {
    verb: 'link',
    payload: 'packet',
    direction: 'forward',
    specId: '',
    label: 'link',
    score: 0,
  }
}
