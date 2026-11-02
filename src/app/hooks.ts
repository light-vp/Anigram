// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useState, useSyncExternalStore } from 'react'

import { Simulation } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'

/**
 * One running simulation, ticked by a single requestAnimationFrame loop. The
 * sheet re-renders from the frame it publishes; nothing else keeps time.
 * Mount the caller with `key={scene.id}` so a new scene gets a fresh one.
 */
export function useSimulation(
  scene: Scene,
  setup?: (sim: Simulation) => void,
): Simulation {
  const [sim] = useState(() => {
    const s = new Simulation(scene)
    setup?.(s)
    return s
  })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      sim.tick((now - last) / 1000)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [sim])

  return sim
}

export function useFrame(sim: Simulation) {
  return useSyncExternalStore(sim.subscribe, sim.getFrame)
}

const REDUCED = '(prefers-reduced-motion: reduce)'
/** one media query list, so a sheet re-rendering every frame neither re-queries nor re-subscribes */
const reducedQuery = () =>
  typeof window === 'undefined' ? null : window.matchMedia(REDUCED)
let reduced: MediaQueryList | null | undefined
const reducedList = () => (reduced ??= reducedQuery())
const subscribeReduced = (fn: () => void) => {
  const mq = reducedList()
  mq?.addEventListener('change', fn)
  return () => mq?.removeEventListener('change', fn)
}
const reducedNow = () => reducedList()?.matches ?? false

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedNow, () => false)
}
