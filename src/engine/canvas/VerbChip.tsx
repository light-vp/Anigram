// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useState } from 'react'

import { cx } from '../lib/cx'
import { getNodeKind, getVerbDef } from '../registry/packRegistry'
import { resolveInteraction } from '../resolver/resolveInteraction'
import { useDiagramStore } from '../store/useDiagramStore'
import { CORE_VERBS } from '../types/taxonomy'
import styles from './VerbChip.module.css'

interface VerbChipProps {
  interactionId: string
  x: number
  y: number
}

/**
 * The on-edge verb chip. Shows the interaction's current verb; clicking opens a
 * menu of resolver-suggested verbs (semantic defaults) plus the full verb
 * catalogue (freeform override) — "semantic defaults + freeform override".
 */
export function VerbChip({ interactionId, x, y }: VerbChipProps) {
  const [open, setOpen] = useState(false)
  const interaction = useDiagramStore((s) => s.interactions[interactionId])
  const nodes = useDiagramStore((s) => s.nodes)
  const setInteractionVerb = useDiagramStore((s) => s.setInteractionVerb)

  if (!interaction) return null

  const sourceKind = getNodeKind(
    nodes.find((n) => n.id === interaction.from)?.data.kindId ?? '',
  )
  const targetKind = getNodeKind(
    nodes.find((n) => n.id === interaction.to)?.data.kindId ?? '',
  )
  const candidates =
    sourceKind && targetKind ? resolveInteraction(sourceKind, targetKind) : []
  const suggested = new Set(candidates.map((c) => String(c.verb)))
  const otherVerbs = CORE_VERBS.filter((v) => !suggested.has(v))

  const currentLabel =
    getVerbDef(String(interaction.verb))?.label ?? String(interaction.verb)

  const pick = (verb: string) => {
    setInteractionVerb(interactionId, verb)
    setOpen(false)
  }

  return (
    <div
      className={cx(styles.wrap, 'nodrag', 'nopan')}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
    >
      <button
        type="button"
        className={cx(styles.chip, !interaction.resolved && styles.manual)}
        onClick={() => setOpen((o) => !o)}
      >
        {currentLabel}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="close menu"
            onClick={() => setOpen(false)}
          />
          <div className={styles.pop} role="menu">
            {candidates.length > 0 ? (
              <div className={styles.section}>suggested</div>
            ) : null}
            {candidates.map((c) => (
              <button
                key={String(c.verb)}
                type="button"
                className={cx(
                  styles.item,
                  interaction.verb === c.verb && styles.active,
                )}
                onClick={() => pick(String(c.verb))}
              >
                <span>{c.label}</span>
                {c.score >= 1000 ? (
                  <span className={styles.badge}>default</span>
                ) : null}
              </button>
            ))}
            <div className={styles.section}>all verbs</div>
            {otherVerbs.map((v) => (
              <button
                key={v}
                type="button"
                className={cx(
                  styles.item,
                  interaction.verb === v && styles.active,
                )}
                onClick={() => pick(v)}
              >
                {getVerbDef(v)?.label ?? v}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
