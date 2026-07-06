// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { create } from 'zustand'

/**
 * High-frequency simulation controls. The animation scheduler reads these via
 * getState() inside its rAF loop (no subscription), so ticking never re-renders
 * React. Only the throughput slider and reset button (React controls) write here.
 */
export interface SimState {
  /** global speed multiplier (0.1..4); divides every duration + emission rate */
  throughput: number
  /** bumped to ask the scheduler to reset node levels to their initial values */
  resetNonce: number
  setThroughput: (value: number) => void
  resetLevels: () => void
}

export const useSimStore = create<SimState>((set) => ({
  throughput: 1,
  resetNonce: 0,
  setThroughput: (value) =>
    set({ throughput: Math.min(4, Math.max(0.1, value)) }),
  resetLevels: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
}))
