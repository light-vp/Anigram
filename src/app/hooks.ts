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

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', fn)
      return () => mq.removeEventListener('change', fn)
    },
    () => window.matchMedia(query).matches,
  )
}
