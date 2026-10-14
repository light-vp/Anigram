// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { captionAt } from '../sim/captions.ts'
import type { Scene } from '../sim/types.ts'
import { readout } from '../view/format.ts'
import { sheetSize } from '../view/geometry.ts'
import type { ThemeId } from '../view/palette.ts'
import { Sheet } from '../view/Sheet.tsx'
import { useFrame, usePrefersReducedMotion, useSimulation } from './hooks'
import type { Params } from './params'
import { SourceLink } from './SourceLink'
import { Transport } from './Transport'
import styles from './views.module.css'

/**
 * For an iframe on someone's page (?embed=1), and inside the
 * <living-diagram> element: the sheet, a slim play bar and the caption.
 * Parts are still clickable — switches flip, and the part's note shows in a
 * corner. In an iframe it fills the frame; with `fit` (the element) it is as
 * tall as the sheet's proportions make it.
 */
export function EmbedView({
  scene,
  theme,
  initial,
  fit = false,
}: {
  scene: Scene
  theme: ThemeId
  initial: Params
  fit?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const sim = useSimulation(scene, (s) => {
    if (initial.hour !== null) s.seek(initial.hour)
    if (initial.speed !== null) s.setSpeed(initial.speed)
    if (initial.paper || initial.paused || reduced) s.setPlaying(false)
  })
  const frame = useFrame(sim)
  const [selected, setSelected] = useState<string | null>(null)
  const still = initial.paper || reduced

  useEffect(() => {
    sim.animate = !still
  }, [sim, still])

  // the element's attributes can change under a running sheet: apply what
  // changed and keep the clock going (the app's params never change)
  const applied = useRef(initial)
  useEffect(() => {
    const was = applied.current
    applied.current = initial
    if (was === initial) return
    if (initial.speed !== was.speed) sim.setSpeed(initial.speed ?? 1)
    if (initial.hour !== was.hour && initial.hour !== null)
      sim.seek(initial.hour)
    if (initial.paused !== was.paused || initial.paper !== was.paper)
      sim.setPlaying(!(initial.paused || initial.paper || reduced))
  }, [sim, initial, reduced])

  const part = selected ? scene.parts.find((p) => p.id === selected) : undefined
  const caption = captionAt(scene, frame.hour)
  const { w, h } = sheetSize(scene)

  return (
    <div
      className={fit ? styles.fit : styles.embed}
      style={{ '--sheet-aspect': `${w} / ${h}` } as CSSProperties}
    >
      <Sheet
        scene={scene}
        frame={frame}
        theme={theme}
        annotate={still}
        animate={!still}
        selected={selected}
        onSelect={setSelected}
        onToggle={(id) => sim.toggle(id)}
        className={styles.sheet}
        credit={initial.credit}
      />
      {part && frame.parts[part.id] && (
        <div className={styles.note} role="status">
          <strong>{part.label}</strong>{' '}
          <span>{readout(scene, part, frame.parts[part.id]!).value}</span>
          {part.note && <p>{part.note}</p>}
        </div>
      )}
      <div className={styles.bar}>
        {initial.controls && <Transport sim={sim} frame={frame} compact />}
        <div className={styles.foot}>
          <p className={styles.caption}>{caption ?? ''}</p>
          <SourceLink inline />
        </div>
      </div>
    </div>
  )
}

/**
 * For a screen on a wall (?screen=1): full bleed, a big caption, and when a
 * sheet's day is over it moves on to the next one.
 */
export function ScreenView({
  scene,
  theme,
  credit,
  onDone,
}: {
  scene: Scene
  theme: ThemeId
  credit: boolean
  onDone: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const sim = useSimulation(scene, (s) => s.setSpeed(1.5))
  const frame = useFrame(sim)

  useEffect(() => {
    sim.animate = !reduced
  }, [sim, reduced])

  useEffect(() => {
    if (frame.day > 0) onDone()
  }, [frame.day, onDone])

  const caption = captionAt(scene, frame.hour)
  return (
    <div className={styles.screen}>
      <Sheet
        scene={scene}
        frame={frame}
        theme={theme}
        annotate={reduced}
        animate={!reduced}
        selected={null}
        className={styles.sheet}
        credit={credit}
      />
      <p className={styles.screenCaption}>{caption ?? '\u00a0'}</p>
      <SourceLink />
    </div>
  )
}
