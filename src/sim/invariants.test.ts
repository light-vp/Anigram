// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compile, initialMemory, solve } from './solver.ts'
import type {
  Behaviour,
  Domain,
  Env,
  LinkSpec,
  PartSpec,
  Scene,
} from './types.ts'

/*
 * Rules that must hold for any network, checked on a few hundred random
 * ones: nothing flows backwards or past a limit, junctions pass on exactly
 * what they take, nothing is made from nothing, and stores stay in bounds.
 */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** a random but well-formed network: supply on the left, demand on the right */
function randomScene(seed: number): Scene {
  const r = rng(seed)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
  const amount = () => Math.round(r() * 100) / 10
  const parts: PartSpec[] = []
  const links: LinkSpec[] = []
  const add = (id: string, behaviour: Behaviour) =>
    parts.push({
      id,
      kind: 'busbar',
      label: id,
      at: [parts.length, 0],
      behaviour,
    })
  const link = (
    from: string,
    to: string,
    domain: Domain = 'electric',
    extra: Partial<LinkSpec> = {},
  ) =>
    links.push({
      from,
      to,
      domain,
      // a loss link carries whatever is lost, so only product links get a limit
      ...(r() < 0.2 && !extra.loss ? { capacity: amount() } : {}),
      ...extra,
    })

  add('bus', { role: 'bus' })
  const sources = 1 + Math.floor(r() * 3)
  for (let i = 0; i < sources; i++) {
    add(`src${i}`, {
      role: 'source',
      output: amount(),
      dispatchable: r() < 0.3,
    })
    link(`src${i}`, r() < 0.3 ? `gate` : 'bus')
  }
  add('gate', {
    role: 'gate',
    capacity: amount(),
    open: Math.round(r() * 10) / 10,
  })
  link('gate', 'bus')
  if (r() < 0.6) {
    add('fuel', { role: 'source', output: 50, dispatchable: true })
    add('gen', {
      role: 'converter',
      output: 'electric',
      recipe: { fuel: 1 + r() * 2 },
      capacity: amount() || 1,
    })
    add('sky', { role: 'vent' })
    link('fuel', 'gen', 'fuel')
    link('gen', 'bus')
    link('gen', 'sky', 'heat', { loss: true })
  }
  if (r() < 0.7) {
    add('store', {
      role: 'storage',
      capacity: 1 + amount(),
      start: r(),
      maxIn: amount(),
      maxOut: amount(),
      efficiency: pick([1, 0.9, 0.75]),
    })
    link('bus', 'store')
    link('store', 'bus')
  }
  const sinks = 1 + Math.floor(r() * 4)
  for (let i = 0; i < sinks; i++) {
    add(`load${i}`, {
      role: 'sink',
      demand: amount(),
      priority: pick([0, 0, 5, 10]),
    })
    link('bus', `load${i}`)
  }
  if (r() < 0.5) {
    add('export', { role: 'sink', demand: 1000, absorbsSurplus: true })
    link('bus', 'export')
  }
  return {
    id: `random-${seed}`,
    title: 'random',
    subtitle: '',
    sheet: 'LD-000',
    size: [parts.length, 1],
    units: {},
    scale: {},
    parts,
    links,
    clock: { start: 0, rate: 1 },
  }
}

const env: Env = {
  hour: 12,
  day: 0,
  knob: () => 0,
  on: () => false,
  prev: () => ({ in: 0, out: 0, fill: 0, effort: NaN }),
}
const EPS = 1e-6
const DT = 1 / 30

for (let seed = 1; seed <= 300; seed++) {
  test(`invariants hold on random network ${seed}`, () => {
    const scene = randomScene(seed)
    const model = compile(scene)
    const memory = initialMemory(model)
    for (let tick = 0; tick < 60; tick++) {
      const before = new Map(memory.level)
      const { parts, links } = solve(model, env, DT, memory)
      const where = `seed ${seed}, tick ${tick}`

      links.forEach((l, i) => {
        assert.ok(
          Number.isFinite(l.flow) && l.flow >= -EPS,
          `${where}: link ${i} flow ${l.flow}`,
        )
        assert.ok(
          l.flow <= l.capacity + EPS,
          `${where}: link ${i} over its capacity`,
        )
      })
      const into = (id: string, domain?: Domain, loss = false) =>
        scene.links.reduce(
          (s, l, i) =>
            l.to === id && (!domain || l.domain === domain) && !!l.loss === loss
              ? s + links[i]!.flow
              : s,
          0,
        )
      const outOf = (id: string, loss = false) =>
        scene.links.reduce(
          (s, l, i) =>
            l.from === id && !!l.loss === loss ? s + links[i]!.flow : s,
          0,
        )

      for (const p of scene.parts) {
        const b = p.behaviour
        const s = parts[p.id]!
        const at = `${where}: ${p.id}`
        switch (b.role) {
          case 'bus':
          case 'gate':
            assert.ok(
              Math.abs(into(p.id) - outOf(p.id)) < EPS,
              `${at} passes on ${outOf(p.id)} of ${into(p.id)}`,
            )
            if (b.role === 'gate')
              assert.ok(
                outOf(p.id) <= b.capacity * (b.open as number) + EPS,
                `${at} past its opening`,
              )
            break
          case 'source':
            assert.ok(
              outOf(p.id) <= (b.output as number) + EPS,
              `${at} makes more than it can`,
            )
            break
          case 'sink':
            if (!b.absorbsSurplus)
              assert.ok(
                into(p.id) <= (b.demand as number) + EPS,
                `${at} takes more than it asked`,
              )
            break
          case 'converter': {
            const made = outOf(p.id)
            for (const [d, per] of Object.entries(b.recipe))
              assert.ok(
                made * per! <= into(p.id, d as Domain) + EPS,
                `${at} made ${made} from too little ${d}`,
              )
            const lost = outOf(p.id, true)
            assert.ok(
              Math.abs(into(p.id) - made - lost) < EPS,
              `${at} energy in ≠ out + loss`,
            )
            if (b.capacity !== undefined)
              assert.ok(made <= b.capacity + EPS, `${at} past capacity`)
            break
          }
          case 'storage': {
            const level = memory.level.get(p.id)!
            assert.ok(
              level >= -EPS && level <= b.capacity + EPS,
              `${at} level ${level} out of bounds`,
            )
            const expected =
              before.get(p.id)! +
              (into(p.id) * (b.efficiency ?? 1) - outOf(p.id)) * DT
            assert.ok(
              Math.abs(Math.min(b.capacity, Math.max(0, expected)) - level) <
                EPS,
              `${at} level moved by something other than its flows`,
            )
            assert.ok(
              outOf(p.id) <= (b.maxOut as number) + EPS &&
                into(p.id) <= (b.maxIn as number) + EPS,
              `${at} past its rate`,
            )
            break
          }
        }
        assert.ok(
          s.activity >= 0 && s.activity <= 1,
          `${at} activity ${s.activity}`,
        )
      }
    }
  })
}
