// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Frame, Simulation } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'
import { ROLE_NAMES, details } from '../view/format.ts'
import styles from './panels.module.css'

/** the selected part, live — or, with nothing selected, how to read the sheet */
export function Inspector({
  scene,
  frame,
  selected,
}: {
  scene: Scene
  frame: Frame
  selected: string | null
}) {
  const part = selected ? scene.parts.find((p) => p.id === selected) : undefined
  const s = part ? frame.parts[part.id] : undefined
  if (!part || !s) {
    return (
      <section className={styles.card} aria-label="How to read this sheet">
        <h2 className={styles.h}>How to read it</h2>
        <p className={styles.p}>
          Everything on this sheet is a running simulation. Line thickness is
          how much is flowing; the dashes travel at its speed. Nothing is
          animated by hand.
        </p>
        <p className={styles.p}>
          Click any part to see its numbers and light up where its flow comes
          from right now.
        </p>
      </section>
    )
  }
  return (
    <section
      className={styles.card}
      aria-live="polite"
      aria-label={`${part.label} details`}
    >
      <p className={styles.kicker}>{ROLE_NAMES[part.behaviour.role]}</p>
      <h2 className={styles.h}>{part.label}</h2>
      {part.note && <p className={styles.p}>{part.note}</p>}
      <dl className={styles.table}>
        {details(scene, part, s).map(([k, v], i) => (
          <div key={i}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** the scene's sliders and switches */
export function Controls({ scene, sim }: { scene: Scene; sim: Simulation }) {
  if (!scene.knobs?.length && !scene.switches?.length) return null
  return (
    <section className={styles.card} aria-label="Controls">
      <h2 className={styles.h}>Try</h2>
      {scene.knobs?.map((k) => {
        const v = sim.knobs[k.id] ?? k.value
        return (
          <label key={k.id} className={styles.knob}>
            <span className={styles.knobHead}>
              <span>{k.label}</span>
              <output>{k.format ? k.format(v) : v.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min={k.min ?? 0}
              max={k.max ?? 1}
              step={k.step ?? 0.01}
              value={v}
              onChange={(e) => sim.setKnob(k.id, Number(e.target.value))}
            />
          </label>
        )
      })}
      {scene.switches?.map((sw) => (
        <label key={sw.id} className={styles.switch}>
          <input
            type="checkbox"
            checked={sim.switches[sw.id] ?? sw.on}
            onChange={() => sim.toggle(sw.id)}
          />
          <span>{sw.label}</span>
        </label>
      ))}
    </section>
  )
}

/** what's going wrong right now */
export function Alerts({
  frame,
  onSelect,
}: {
  frame: Frame
  onSelect: (id: string) => void
}) {
  if (!frame.alerts.length) return null
  return (
    <section
      className={`${styles.card} ${styles.alerts}`}
      aria-label="Problems"
    >
      <h2 className={styles.h}>Watch</h2>
      <ul>
        {frame.alerts.map((a, i) => (
          <li key={i}>
            <button type="button" onClick={() => onSelect(a.partId)}>
              {a.text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
