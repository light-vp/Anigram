// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useShallow } from 'zustand/react/shallow'

import { effectiveSpec, getAtPath } from '../animation/effectiveSpec'
import { glyphFor } from '../animation/payloadGlyphs'
import { cx } from '../lib/cx'
import { getSpec, getVerbDef } from '../registry/packRegistry'
import { useDiagramStore } from '../store/useDiagramStore'
import type { ParamControl } from './paramControls'
import { controlFor } from './paramControls'
import styles from './Inspector.module.css'

/**
 * L1 authoring: a per-interaction inspector generated from the spec's
 * exposedParams. Edits merge into interaction.params live (the scheduler reads
 * the effective spec every frame); reset clears the overrides.
 */
export function Inspector() {
  const {
    selectedEdgeId,
    edges,
    interactions,
    setInteractionParam,
    resetInteractionParams,
  } = useDiagramStore(
    useShallow((s) => ({
      selectedEdgeId: s.selectedEdgeId,
      edges: s.edges,
      interactions: s.interactions,
      setInteractionParam: s.setInteractionParam,
      resetInteractionParams: s.resetInteractionParams,
    })),
  )

  const edge = edges.find((e) => e.id === selectedEdgeId)
  const interactionId = edge?.data?.interactionId
  const interaction = interactionId ? interactions[interactionId] : undefined

  if (!interaction || !interactionId) {
    return (
      <aside className={styles.panel}>
        <div className={styles.empty}>
          Select a connection to tune its animation.
        </div>
      </aside>
    )
  }

  const base = getSpec(interaction.specId)
  const eff = effectiveSpec(interaction)
  const controls = (base?.exposedParams ?? [])
    .map(controlFor)
    .filter((c): c is ParamControl => c !== null)
  const dirty = Object.keys(interaction.params).length > 0
  const verbLabel =
    getVerbDef(String(interaction.verb))?.label ?? String(interaction.verb)

  return (
    <aside className={styles.panel}>
      <header className={styles.head}>
        <span className={styles.verb}>{verbLabel}</span>
        <button
          type="button"
          className={styles.reset}
          disabled={!dirty}
          onClick={() => resetInteractionParams(interactionId)}
        >
          reset
        </button>
      </header>

      {controls.length === 0 ? (
        <p className={styles.note}>This verb has no tunable animation yet.</p>
      ) : (
        <div className={styles.controls}>
          {controls.map((control) => (
            <ControlRow
              key={control.path}
              control={control}
              value={getAtPath(eff, control.path)}
              onChange={(v) => setInteractionParam(interactionId, control.path, v)}
            />
          ))}
        </div>
      )}
    </aside>
  )
}

function ControlRow({
  control,
  value,
  onChange,
}: {
  control: ParamControl
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <label className={styles.row}>
      <span className={styles.label}>{control.label}</span>

      {control.kind === 'slider' ? (
        <span className={styles.sliderWrap}>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(value ?? control.min)}
            onChange={(e) => onChange(Number.parseFloat(e.target.value))}
            className={styles.slider}
          />
          <span className={styles.value}>
            {Number(value ?? control.min)}
            {control.unit ?? ''}
          </span>
        </span>
      ) : null}

      {control.kind === 'select' ? (
        <select
          className={styles.select}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          {control.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}

      {control.kind === 'color' ? (
        <span className={styles.swatches}>
          {control.tokens.map((t) => (
            <button
              key={t.token}
              type="button"
              title={t.label}
              className={cx(
                styles.swatch,
                value === t.token && styles.swatchActive,
              )}
              style={{ background: t.token }}
              onClick={() => onChange(t.token)}
            />
          ))}
        </span>
      ) : null}

      {control.kind === 'sprite' ? (
        <span className={styles.sprites}>
          {control.options.map((p) => (
            <button
              key={p}
              type="button"
              title={p}
              className={cx(styles.sprite, value === p && styles.spriteActive)}
              onClick={() => onChange(p)}
              dangerouslySetInnerHTML={{
                __html: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">${glyphFor(p)}</svg>`,
              }}
            />
          ))}
        </span>
      ) : null}
    </label>
  )
}
