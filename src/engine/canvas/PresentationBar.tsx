// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { cx } from '../lib/cx'
import { getScene } from '../registry/packRegistry'
import { useSimStore } from '../store/useSimStore'
import styles from './PresentationBar.module.css'

/**
 * The presentation step-through. Auto-plays (looping) by default — great for a
 * hands-off demo or recording — and supports manual prev/next/scrub.
 */
export function PresentationBar() {
  const { presentation, nextStep, prevStep, setStep, exitPresentation } =
    useSimStore(
      useShallow((s) => ({
        presentation: s.presentation,
        nextStep: s.nextStep,
        prevStep: s.prevStep,
        setStep: s.setStep,
        exitPresentation: s.exitPresentation,
      })),
    )
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!presentation || !playing) return
    const seq = presentation.steps
    if (seq.length === 0) return
    const hold = seq[presentation.step]?.holdMs ?? 1800
    const timer = setTimeout(() => {
      if (presentation.step >= seq.length - 1) setStep(0)
      else nextStep()
    }, hold)
    return () => clearTimeout(timer)
  }, [presentation, playing, setStep, nextStep])

  if (!presentation) return null

  const scene = getScene(presentation.sceneId)
  const step = presentation.step
  const steps = presentation.steps
  const total = steps.length

  return (
    <div className={styles.bar}>
      <div className={styles.head}>
        <span className={styles.title}>{scene?.title}</span>
        <button
          type="button"
          className={styles.close}
          onClick={exitPresentation}
          aria-label="exit presentation"
        >
          ✕
        </button>
      </div>

      <div className={styles.row}>
        <button
          type="button"
          className={styles.nav}
          onClick={prevStep}
          disabled={step === 0}
          aria-label="previous step"
        >
          ‹
        </button>
        <button
          type="button"
          className={styles.play}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className={styles.captionWrap}>
          <span className={styles.counter}>
            {step + 1} / {total}
          </span>
          <span className={styles.caption}>{steps[step]?.caption}</span>
        </div>
        <button
          type="button"
          className={styles.nav}
          onClick={nextStep}
          disabled={step === total - 1}
          aria-label="next step"
        >
          ›
        </button>
      </div>

      <div className={styles.progress}>
        {steps.map((s, i) => (
          <button
            key={`${s.caption}-${i}`}
            type="button"
            className={cx(styles.dot, i <= step && styles.dotOn)}
            onClick={() => setStep(i)}
            aria-label={`step ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
