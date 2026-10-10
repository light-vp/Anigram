// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// Run a scene headless through a day and print what every part did, hour by
// hour. For tuning scenes: `node scripts/simulate-day.ts grid`
import { findScene } from '../src/scenes/index.ts'
import { Simulation } from '../src/sim/runtime.ts'

const scene = findScene(process.argv[2])
const sim = new Simulation(scene)
sim.animate = false
const ids = (process.argv[3] ?? '').split(',').filter(Boolean)
const show = ids.length
  ? scene.parts.filter((p) => ids.includes(p.id))
  : scene.parts
const fmt = (v: number) =>
  (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)).padStart(6)
console.log('hour  ' + show.map((p) => p.id.slice(0, 7).padStart(15)).join(''))
for (let h = 0; h < 24; h++) {
  // one real second at rate r moves r hours
  sim.tick(0.1)
  while (Math.floor(sim.hour) !== (scene.clock.start + h + 1) % 24)
    sim.tick(0.05)
  const f = sim.frame
  const row = show.map((p) => {
    const s = f.parts[p.id]!
    const b = p.behaviour
    if (b.role === 'storage')
      return `${fmt(s.in - s.out)} ${(s.fill * 100).toFixed(0).padStart(3)}%`.padStart(
        15,
      )
    if (b.role === 'vent') return fmt(s.in).padStart(15)
    if (b.role === 'sink') return `${fmt(s.in)}/${fmt(s.demand)}`.padStart(15)
    return `${fmt(s.out)}`.padStart(15)
  })
  console.log(`${String(Math.floor(f.hour)).padStart(2)}:00 ${row.join('')}`)
}
console.log(
  'alerts at end:',
  sim.frame.alerts.map((a) => a.text).join('; ') || 'none',
)
