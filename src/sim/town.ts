// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { LinkSpec, PartSpec, Scene } from './types.ts'

/**
 * A big made-up town for timing the solver: sun, wind and a gas plant on
 * one bus with a battery, `feeders` breakers off it, and `houses` homes on
 * each feeder, every third one a priority customer. Twenty feeders of
 * twelve houses is 288 parts, the size a real P&ID or feeder diagram gets.
 */
export function town(feeders = 20, houses = 12): Scene {
  const parts: PartSpec[] = []
  const links: LinkSpec[] = []
  const add = (id: string, behaviour: PartSpec['behaviour']) =>
    parts.push({
      id,
      kind: 'house',
      label: id,
      at: [parts.length % 40, Math.floor(parts.length / 40)],
      behaviour,
    })
  const link = (
    from: string,
    to: string,
    domain: LinkSpec['domain'] = 'electric',
    extra: Partial<LinkSpec> = {},
  ) => links.push({ from, to, domain, ...extra })

  add('sun', { role: 'source', output: `${20 * feeders} * sun(hour)` })
  add('wind', { role: 'source', output: `${10 * feeders} + 2 * sin(hour)` })
  add('gas', { role: 'source', output: 1e5, dispatchable: true })
  add('plant', {
    role: 'converter',
    output: 'electric',
    recipe: { fuel: 2.5 },
    capacity: 30 * feeders,
  })
  add('sky', { role: 'vent' })
  add('main', { role: 'bus' })
  add('battery', {
    role: 'storage',
    capacity: 100 * feeders,
    maxIn: 15 * feeders,
    maxOut: 15 * feeders,
  })
  add('export', { role: 'sink', demand: 1e5, absorbsSurplus: true })
  link('gas', 'plant', 'fuel')
  link('plant', 'sky', 'heat', { loss: true })
  for (const id of ['sun', 'wind', 'plant', 'battery']) link(id, 'main')
  link('main', 'battery')
  link('main', 'export')
  for (let f = 0; f < feeders; f++) {
    add(`breaker${f}`, { role: 'gate', capacity: 80 })
    add(`feeder${f}`, { role: 'bus' })
    link('main', `breaker${f}`, 'electric', { capacity: 90 })
    link(`breaker${f}`, `feeder${f}`)
    for (let h = 0; h < houses; h++) {
      add(`house${f}_${h}`, {
        role: 'sink',
        demand: `${2 + (h % 5)} * (0.6 + 0.4 * sin(hour + ${f}))`,
        priority: h % 3 === 0 ? 1 : 0,
      })
      link(`feeder${f}`, `house${f}_${h}`)
    }
  }
  return {
    id: 'town',
    title: 'Town',
    subtitle: 'a solver benchmark',
    sheet: 'BENCH',
    size: [40, Math.ceil(parts.length / 40)],
    units: { electric: { rate: 'kW', amount: 'kWh' } },
    scale: {},
    parts,
    links,
    clock: { start: 0, rate: 1 },
  }
}
