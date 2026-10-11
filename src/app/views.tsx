// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useState } from 'react'

import { captionAt } from '../sim/captions.ts'
import type { Scene } from '../sim/types.ts'
import { readout } from '../view/format.ts'
import type { ThemeId } from '../view/palette.ts'
import { Sheet } from '../view/Sheet.tsx'
import { useFrame, usePrefersReducedMotion, useSimulation } from './hooks'
import type { Params } from './params'
import { SourceLink } from './SourceLink'
import { Transport } from './Transport'
import styles from './views.module.css'

/**
 * For an iframe on someone's page (?embed=1): the sheet, a slim play bar and
 * the caption. Parts are still clickable — switches flip, and the part's
 * note shows in a corner.
 */
export function EmbedView({
  scene,
  theme,
  initial,
}: {
  scene: Scene
  theme: ThemeId
  initial: Params
}) {
  const reduced = usePrefersReducedMotion()
  const sim = useSimulation(scene, (s) => {
    if (initial.hour !== null) s.seek(initial.hour)
    if (initial.speed !== null) s.setSpeed(initial.speed)
    if (initial.paper || reduced) s.setPlaying(false)
  })
  const frame = useFrame(sim)
  const [selected, setSelected] = useState<string | null>(null)
  const still = initial.paper || reduced

  useEffect(() => {
    sim.animate = !still
  }, [sim, still])

  const part = selected ? scene.parts.find((p) => p.id === selected) : undefined
  const caption = captionAt(scene, frame.hour)

  return (
    <div className={styles.embed}>
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
        <Transport sim={sim} frame={frame} compact />
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>
      <SourceLink />
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
