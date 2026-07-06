// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { create } from 'zustand'

import type { SimStep } from '../types/pack'

export interface PresentationState {
  sceneId: string
  steps: SimStep[]
  step: number
}

/**
 * High-frequency simulation controls + presentation state. The animation
 * scheduler reads these via getState() inside its rAF loop (no subscription),
 * so ticking never re-renders React.
 */
export interface SimState {
  /** global speed multiplier (0.1..4); divides every duration + emission rate */
  throughput: number
  /** bumped to ask the scheduler to reset node levels to their initial values */
  resetNonce: number
  /** bumped to ask the canvas to fit the view (e.g. after loading a scene) */
  fitNonce: number
  /** when set, only the current step's interactions animate (presentation mode) */
  presentation: PresentationState | null

  setThroughput: (value: number) => void
  resetLevels: () => void
  requestFit: () => void
  startPresentation: (sceneId: string, steps: SimStep[]) => void
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  exitPresentation: () => void
}

export const useSimStore = create<SimState>((set) => ({
  throughput: 1,
  resetNonce: 0,
  fitNonce: 0,
  presentation: null,

  setThroughput: (value) =>
    set({ throughput: Math.min(4, Math.max(0.1, value)) }),
  resetLevels: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),

  startPresentation: (sceneId, steps) =>
    set({ presentation: { sceneId, steps, step: 0 } }),

  setStep: (step) =>
    set((s) => {
      const p = s.presentation
      if (!p) return {}
      const clamped = Math.max(0, Math.min(p.steps.length - 1, step))
      return { presentation: { ...p, step: clamped } }
    }),

  nextStep: () =>
    set((s) => {
      const p = s.presentation
      if (!p) return {}
      return {
        presentation: { ...p, step: Math.min(p.steps.length - 1, p.step + 1) },
      }
    }),

  prevStep: () =>
    set((s) => {
      const p = s.presentation
      if (!p) return {}
      return { presentation: { ...p, step: Math.max(0, p.step - 1) } }
    }),

  exitPresentation: () => set({ presentation: null }),
}))
