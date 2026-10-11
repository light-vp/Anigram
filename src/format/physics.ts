// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PART_KINDS } from '../parts/kinds.ts'
import type { Domain, Scene } from '../sim/types.ts'
import { ENERGY_DOMAINS } from '../sim/types.ts'

/*
 * Physics sanity: a scene can validate, simulate and pass its own `expect`
 * list and still describe a machine that couldn't exist, because the
 * assistant that wrote the numbers also wrote the claims. These checks catch
 * the ways a sheet can break conservation of energy or quietly drop a flow,
 * and say how to fix each one. They are warnings: a sheet may simplify on
 * purpose, and the solver will still run it.
 */

/** room for rounding in a recipe before it counts as making energy */
const SLACK = 0.001

const isEnergy = (d: string) => ENERGY_DOMAINS.has(d as Domain)

const pct = (x: number) => `${Math.round(x * 100)}%`

/**
 * Warnings in the validator's `path: message` shape. `parts` and `links` are
 * the validated lists; anything malformed was already reported as an error.
 */
export function physicsWarnings(
  scene: Pick<Scene, 'parts' | 'links' | 'units'>,
): string[] {
  const out: string[] = []
  const warn = (path: string, msg: string) => out.push(`${path}: ${msg}`)
  const { parts, links, units } = scene

  // energy ratios only mean something when every energy domain counts in the same unit
  const energyUnits = new Set(
    [...ENERGY_DOMAINS].flatMap((d) => (units[d] ? [units[d]!.rate] : [])),
  )
  const comparable = energyUnits.size <= 1

  for (const p of parts) {
    const b = p.behaviour
    const where = `parts (${p.id})`
    const ins = links.filter((l) => l.to === p.id && !l.loss)
    const outs = links.filter((l) => l.from === p.id)

    // a machine made into a source makes its output from nothing
    const kind = PART_KINDS[p.kind as keyof typeof PART_KINDS]
    if (b.role === 'source' && kind?.role === 'converter')
      warn(
        where,
        `a ${p.kind} is a source here, so it makes its output from nothing and anything linked into it is ignored. ` +
          `Make it a converter whose recipe says what it runs on, e.g. { "role": "converter", "output": "water", "recipe": { "water": 1, "electric": 0.2 } } for a pump`,
      )
    else if (b.role === 'source' && ins.length)
      warn(
        where,
        `a source ignores what comes in, so the ${ins.map((l) => `${l.domain} from ${l.from}`).join(', ')} never runs it. ` +
          'Make it a converter with that input in its recipe',
      )

    if (b.role === 'sink')
      for (const l of outs.filter((l) => !l.loss))
        warn(
          where,
          `a sink only consumes, so its ${l.domain} link to ${l.to} never carries anything. Make it a converter if it passes something on`,
        )

    if (b.role === 'converter') {
      const recipe = b.recipe as Record<string, number>
      for (const l of ins)
        if (!(l.domain in recipe))
          warn(
            where,
            `its recipe has no ${l.domain}, so the ${l.domain} from ${l.from} is never drawn. Add ${l.domain} to the recipe or remove the link`,
          )

      const energyIn = Object.entries(recipe)
        .filter(([d]) => isEnergy(d))
        .reduce((a, [, v]) => a + v, 0)
      if (comparable && isEnergy(b.output) && energyIn > 0) {
        if (energyIn < 1 - SLACK) {
          const heat = b.output === 'heat'
          warn(
            where,
            `turns ${energyIn} of energy into 1 of ${b.output}: ${pct(1 / energyIn)} efficient, which makes energy from nothing. ` +
              (heat
                ? `A heat pump takes the rest from outside: add a heat input, e.g. "recipe": { "electric": ${round(energyIn)}, "heat": ${round(1 - energyIn)} } fed from an air or ground source`
                : `Use 1 ÷ efficiency, e.g. ${typical(b.output, recipe)}`),
          )
        }
      }
    }

    // a junction, valve or store passes on what it is given, in the same domain
    if (b.role === 'bus' || b.role === 'gate' || b.role === 'storage') {
      const domains = new Set(
        [...ins, ...outs.filter((l) => !l.loss)].map((l) => l.domain),
      )
      if (domains.size > 1)
        warn(
          where,
          `a ${b.role} passes flow on unchanged, but its links carry ${[...domains].join(' and ')}. ` +
            'Changing one into another takes a converter with a recipe',
        )
    }
  }

  out.push(...roundTrips(parts))
  return out
}

/**
 * Energy that comes back bigger than it left: an electrolyser and a fuel
 * cell, or a pump and a turbine, whose recipes multiply to less than one
 * around the loop. Units cancel around a loop, so this holds whatever units
 * the domains count in (t/h of hydrogen against MW, say).
 */
function roundTrips(parts: Scene['parts']): string[] {
  // cheapest way to make a unit of `to` from `from`, by a converter that takes nothing else
  type Step = { factor: number; via: string[] }
  const best = new Map<string, Step>()
  const key = (a: string, b: string) => `${a}>${b}`
  for (const p of parts) {
    const b = p.behaviour
    if (b.role !== 'converter' || !isEnergy(b.output)) continue
    const inputs = Object.entries(b.recipe as Record<string, number>)
    if (inputs.length !== 1) continue
    const [from, factor] = inputs[0]!
    if (!isEnergy(from) || from === b.output || !(factor > 0)) continue
    const k = key(from, b.output)
    if (!best.has(k) || best.get(k)!.factor > factor)
      best.set(k, { factor, via: [p.id] })
  }
  // close the paths (seven domains at most, so Floyd–Warshall is plenty)
  const domains = [...ENERGY_DOMAINS]
  for (const m of domains)
    for (const a of domains)
      for (const c of domains) {
        const x = best.get(key(a, m))
        const y = best.get(key(m, c))
        if (!x || !y || a === c) continue
        const f = x.factor * y.factor
        const k = key(a, c)
        if (!best.has(k) || best.get(k)!.factor > f)
          best.set(k, { factor: f, via: [...x.via, ...y.via] })
      }
  const out: string[] = []
  const seen = new Set<string>()
  for (const a of domains)
    for (const c of domains) {
      if (a >= c) continue
      const there = best.get(key(a, c))
      const back = best.get(key(c, a))
      if (!there || !back) continue
      const gain = 1 / (there.factor * back.factor)
      const loop = [...there.via, ...back.via]
      const id = [...loop].sort().join()
      if (gain <= 1 + SLACK || seen.has(id)) continue
      seen.add(id)
      out.push(
        `parts (${loop.join(', ')}): 1 ${a} sent round through ${loop.join(' and ')} comes back as ${round(gain)}, ` +
          'so the loop makes energy from nothing. Every conversion loses some: ' +
          `raise their recipes until a round trip returns less than went in (a hydrogen round trip returns about 0.35, a battery about 0.9)`,
      )
    }
  return out
}

const round = (x: number) => Math.round(x * 100) / 100

/** a believable recipe to suggest, from the input the converter already uses */
function typical(output: Domain, recipe: Record<string, number>): string {
  const input = Object.keys(recipe).find(isEnergy) ?? 'fuel'
  const eff: Record<string, number> = {
    fuel: 0.4,
    light: 0.2,
    mechanical: 0.9,
    electric: 0.9,
    heat: 0.3,
  }
  const e = eff[input] ?? 0.5
  return `"recipe": { "${input}": ${round(1 / e)} } for a ${pct(e)}-efficient ${output === 'electric' ? 'generator' : 'converter'}`
}
