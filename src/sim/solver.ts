// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type {
  Behaviour,
  Domain,
  Env,
  LinkSpec,
  PartSpec,
  Scene,
  Signal,
} from './types.ts'
import { compileExpr } from './expr.ts'
import { ENERGY_DOMAINS } from './types.ts'

/*
 * One tick of the flow network, as a pull.
 *
 * Every sink asks its upstream for what it wants; each part passes the ask
 * further up — a bus asks its cheapest input first, a converter asks for its
 * recipe, a gate never asks for more than it lets through — until it reaches
 * something that can give: a source, or a store. What comes back down is the
 * flow on every link. Then stores (and export/spill sinks) pull again in
 * "surplus" mode, which only renewable sources answer — so a battery charges
 * from sun nobody used, never by burning gas.
 *
 * A store answers a pull but never passes one on, so even a loop through a
 * store (pump uphill at night, generate at the peak) cannot recurse.
 */

type Mode = 'firm' | 'surplus'

export interface PartState {
  /** total flow arriving / leaving, in the part's own units */
  in: number
  out: number
  /** sinks: what they asked for this tick */
  demand: number
  /** sources: what they could have produced (the rest was curtailed) */
  avail: number
  /** stores: amount held, and as a fraction of capacity */
  level: number
  fill: number
  /** converters: energy that went in and didn't come out */
  loss: number
  /** gates: how open, 0..1 */
  open: number
  /** converters with a startup time: asked for, but not delivering yet */
  starting: boolean
  /** 0..1 — how hard the part is working; drives rotation, glow, smoke */
  activity: number
}

export interface LinkState {
  flow: number
  capacity: number
}

export interface Compiled {
  scene: Scene
  parts: Map<string, PartSpec>
  links: LinkSpec[]
  /** link indices arriving at each part, firm links only (no loss links) */
  inputs: Map<string, number[]>
  /** loss links leaving each converter */
  lossLinks: Map<string, number[]>
  merit: Map<string, number>
  /** sinks in service order, and the surplus-only ones */
  sinks: PartSpec[]
  surplusSinks: PartSpec[]
  stores: PartSpec[]
}

export function read(signal: Signal, env: Env): number {
  if (typeof signal === 'number') return signal
  return typeof signal === 'string' ? compileExpr(signal)(env) : signal(env)
}

export function compile(scene: Scene): Compiled {
  const parts = new Map(scene.parts.map((p) => [p.id, p]))
  const inputs = new Map<string, number[]>()
  const lossLinks = new Map<string, number[]>()
  for (const p of scene.parts) {
    inputs.set(p.id, [])
    lossLinks.set(p.id, [])
  }
  scene.links.forEach((l, i) => {
    if (!parts.has(l.from) || !parts.has(l.to)) {
      throw new Error(
        `${scene.id}: link ${l.from} → ${l.to} names a part that doesn't exist`,
      )
    }
    if (l.loss) lossLinks.get(l.from)!.push(i)
    else inputs.get(l.to)!.push(i)
  })

  // Merit order: renewables 0, stores 10, anything that burns fuel 20. A
  // pass-through part costs what its cheapest input costs.
  const merit = new Map<string, number>()
  const meritOf = (id: string, seen: Set<string>): number => {
    const known = merit.get(id)
    if (known !== undefined) return known
    const b = parts.get(id)!.behaviour
    let m: number
    if (b.role === 'source') m = b.merit ?? (b.dispatchable ? 20 : 0)
    else if (b.role === 'storage') m = b.merit ?? 10
    else {
      if (seen.has(id)) return 99
      seen.add(id)
      const ins = inputs
        .get(id)!
        .map((i) => meritOf(scene.links[i]!.from, seen))
      m = ins.length ? Math.min(...ins) : 99
    }
    merit.set(id, m)
    return m
  }
  for (const p of scene.parts) meritOf(p.id, new Set())
  for (const ins of inputs.values()) {
    ins.sort(
      (a, b) =>
        merit.get(scene.links[a]!.from)! - merit.get(scene.links[b]!.from)!,
    )
  }

  const byPriority = (p: PartSpec) =>
    p.behaviour.role === 'sink' ? (p.behaviour.priority ?? 0) : 0
  const sinkParts = scene.parts.filter((p) => p.behaviour.role === 'sink')
  return {
    scene,
    parts,
    links: scene.links,
    inputs,
    lossLinks,
    merit,
    sinks: sinkParts
      .filter(
        (p) => !(p.behaviour.role === 'sink' && p.behaviour.absorbsSurplus),
      )
      .sort((a, b) => byPriority(b) - byPriority(a)),
    surplusSinks: sinkParts.filter(
      (p) => p.behaviour.role === 'sink' && p.behaviour.absorbsSurplus,
    ),
    stores: scene.parts.filter((p) => p.behaviour.role === 'storage'),
  }
}

/** What survives from one tick to the next: the contents of every store. */
export interface Memory {
  level: Map<string, number>
  /** float-switch state for stores with `refill` */
  refilling: Map<string, boolean>
  /** hours each slow-starting converter has been asked for, without a break */
  warm: Map<string, number>
}

export function initialMemory(model: Compiled): Memory {
  const level = new Map<string, number>()
  const refilling = new Map<string, boolean>()
  for (const p of model.stores) {
    const b = p.behaviour as Extract<Behaviour, { role: 'storage' }>
    level.set(p.id, b.capacity * (b.start ?? 0.5))
    refilling.set(p.id, false)
  }
  return { level, refilling, warm: new Map() }
}

const EPS = 1e-9

/**
 * Resolve every flow for one tick of `dt` simulated hours and advance the
 * stores. Pure apart from `memory`, which it updates in place.
 */
export function solve(model: Compiled, env: Env, dt: number, memory: Memory) {
  const { parts, links } = model
  const flow = new Float64Array(links.length)
  // capacity a part has already handed out this tick
  const used = new Map<string, number>()
  const inByDomain = new Map<string, Partial<Record<Domain, number>>>()
  const produced = new Map<string, number>()
  const stack = new Set<string>()
  const called = new Set<string>()

  const linkCap = (i: number) => {
    const l = links[i]!
    return (l.capacity ?? Infinity) - flow[i]!
  }

  /** ask `id`'s inputs (of one domain, or any) for `amount`; returns what arrived */
  const pullInputs = (
    id: string,
    amount: number,
    mode: Mode,
    domain?: Domain,
  ): number => {
    let remaining = amount
    for (const i of model.inputs.get(id)!) {
      if (remaining <= EPS) break
      const l = links[i]!
      if (domain && l.domain !== domain) continue
      const ask = Math.min(remaining, linkCap(i))
      if (ask <= EPS) continue
      const got = pull(l.from, ask, mode)
      flow[i]! += got
      remaining -= got
      const d = inByDomain.get(id) ?? {}
      d[l.domain] = (d[l.domain] ?? 0) + got
      inByDomain.set(id, d)
    }
    return amount - remaining
  }

  /** ask part `id` to deliver `amount` at its output; returns what it delivered */
  const pull = (id: string, amount: number, mode: Mode): number => {
    if (amount <= EPS || stack.has(id)) return 0
    const part = parts.get(id)!
    const b = part.behaviour
    const spent = used.get(id) ?? 0
    let got = 0
    stack.add(id)
    switch (b.role) {
      case 'source': {
        if (mode === 'surplus' && b.dispatchable) break
        got = Math.min(amount, Math.max(0, read(b.output, env) - spent))
        break
      }
      case 'storage': {
        if (mode === 'surplus') break
        const level = memory.level.get(id)!
        got = Math.min(
          amount,
          Math.max(0, Math.min(read(b.maxOut, env), level / dt) - spent),
        )
        break
      }
      case 'gate': {
        const cap = b.capacity * clamp01(read(b.open ?? 1, env)) - spent
        got = pullInputs(id, Math.min(amount, Math.max(0, cap)), mode)
        break
      }
      case 'bus':
        got = pullInputs(id, amount, mode)
        break
      case 'converter': {
        if (b.startup) {
          // only a real shortfall cranks a generator; a store topping up
          // from surplus walks past it without waking it
          if (mode === 'firm') called.add(id)
          if ((memory.warm.get(id) ?? 0) < b.startup) break
        }
        let can = Math.min(
          amount,
          Math.max(0, (b.capacity ?? Infinity) - spent),
        )
        for (const [d, per] of Object.entries(b.recipe) as Array<
          [Domain, number]
        >) {
          if (can <= EPS) break
          const arrived = pullInputs(id, can * per, mode, d)
          can = Math.min(can, arrived / per)
        }
        got = can
        break
      }
      case 'sink':
      case 'vent':
        break
    }
    stack.delete(id)
    used.set(id, spent + got)
    if (got > 0) produced.set(id, (produced.get(id) ?? 0) + got)
    return got
  }

  // 1. Firm demand, highest priority first. Equal priorities share a
  //    shortfall: each sink's ask goes in slices, round-robin.
  const demand = new Map<string, number>()
  for (const p of [...model.sinks, ...model.surplusSinks]) {
    demand.set(
      p.id,
      Math.max(0, read((p.behaviour as { demand: Signal }).demand, env)),
    )
  }
  const SLICES = 4
  const groups = new Map<number, PartSpec[]>()
  for (const p of model.sinks) {
    const pr = (p.behaviour as { priority?: number }).priority ?? 0
    groups.set(pr, [...(groups.get(pr) ?? []), p])
  }
  for (const pr of [...groups.keys()].sort((a, b) => b - a)) {
    for (let s = 0; s < SLICES; s++) {
      for (const p of groups.get(pr)!) {
        pullInputs(p.id, demand.get(p.id)! / SLICES, 'firm')
      }
    }
  }

  // 2. Stores charge — from surplus, or (float switch) from anything.
  const charged = new Map<string, number>()
  for (const p of model.stores) {
    const b = p.behaviour as Extract<Behaviour, { role: 'storage' }>
    const level = memory.level.get(p.id)!
    let mode: Mode = 'surplus'
    if (b.refill) {
      const fill = level / b.capacity
      let on = memory.refilling.get(p.id)!
      if (fill <= b.refill.below) on = true
      if (fill >= b.refill.until) on = false
      memory.refilling.set(p.id, on)
      if (!on) continue
      mode = 'firm'
    }
    const room = (b.capacity - level) / dt / (b.efficiency ?? 1)
    // on the stack while it charges, so it can't discharge into itself
    stack.add(p.id)
    const got = pullInputs(p.id, Math.min(read(b.maxIn, env), room), mode)
    stack.delete(p.id)
    charged.set(p.id, got)
  }

  // 3. Whatever is still unclaimed goes to export / spill.
  for (const p of model.surplusSinks) {
    pullInputs(p.id, demand.get(p.id)!, 'surplus')
  }

  // 4. What goes in and doesn't come out as product leaves along loss links.
  //    Energy: an energy product's loss is energy in minus energy out; a
  //    converter whose product isn't energy (a server makes requests) turns
  //    every watt into heat. Matter passes through: a turbine's water leaves
  //    down the tailrace on a water loss link. A pump with no loss link loses
  //    nothing worth drawing — its work went into lifting the water.
  const loss = new Map<string, number>()
  for (const p of model.parts.values()) {
    const b = p.behaviour
    if (b.role !== 'converter') continue
    const outs = model.lossLinks.get(p.id)!
    const ins = inByDomain.get(p.id) ?? {}
    const energyOut = ENERGY_DOMAINS.has(b.output)
    const energyLinks = outs.filter((i) => ENERGY_DOMAINS.has(links[i]!.domain))
    if (energyOut || energyLinks.length) {
      const energyIn = Object.entries(ins)
        .filter(([d]) => ENERGY_DOMAINS.has(d as Domain))
        .reduce((s, [, v]) => s + v, 0)
      const lost = Math.max(
        0,
        energyIn - (energyOut ? (produced.get(p.id) ?? 0) : 0),
      )
      loss.set(p.id, lost)
      for (const i of energyLinks) flow[i] = lost / energyLinks.length
    }
    for (const i of outs) {
      const d = links[i]!.domain
      if (ENERGY_DOMAINS.has(d)) continue
      const same = outs.filter((j) => links[j]!.domain === d).length
      flow[i] = (ins[d] ?? 0) / same
    }
  }

  // 5. Advance the stores.
  for (const p of model.stores) {
    const b = p.behaviour as Extract<Behaviour, { role: 'storage' }>
    const level = memory.level.get(p.id)!
    const next =
      level +
      ((charged.get(p.id) ?? 0) * (b.efficiency ?? 1) -
        (produced.get(p.id) ?? 0)) *
        dt
    memory.level.set(p.id, Math.min(b.capacity, Math.max(0, next)))
  }

  for (const p of model.parts.values()) {
    if (p.behaviour.role !== 'converter' || !p.behaviour.startup) continue
    memory.warm.set(
      p.id,
      called.has(p.id) ? (memory.warm.get(p.id) ?? 0) + dt : 0,
    )
  }

  // 6. Read the state back off the links.
  const inflow = new Map<string, number>()
  const outflow = new Map<string, number>()
  links.forEach((l, i) => {
    outflow.set(l.from, (outflow.get(l.from) ?? 0) + flow[i]!)
    inflow.set(l.to, (inflow.get(l.to) ?? 0) + flow[i]!)
  })

  const partStates: Record<string, PartState> = {}
  for (const p of model.parts.values()) {
    const b = p.behaviour
    const s: PartState = {
      in: inflow.get(p.id) ?? 0,
      out: outflow.get(p.id) ?? 0,
      demand: demand.get(p.id) ?? 0,
      avail: 0,
      level: memory.level.get(p.id) ?? 0,
      fill: 0,
      loss: loss.get(p.id) ?? 0,
      open: 1,
      starting: false,
      activity: 0,
    }
    switch (b.role) {
      case 'source':
        s.avail = read(b.output, env)
        s.activity = s.avail > 0 ? s.out / s.avail : 0
        // a renewable reads as "working" whenever it could be
        if (!b.dispatchable)
          s.activity = s.avail > 0 ? Math.max(0.15, s.out / s.avail) : 0
        break
      case 'sink':
        s.activity = s.demand > 0 ? s.in / s.demand : 0
        break
      case 'storage':
        s.fill = s.level / b.capacity
        s.activity = Math.max(
          ratio(s.in, read(b.maxIn, env)),
          ratio(s.out, read(b.maxOut, env)),
        )
        break
      case 'gate':
        s.open = clamp01(read(b.open ?? 1, env))
        s.activity = s.out / b.capacity
        break
      case 'converter':
        // product only — the loss links' flow is reported as `loss`
        s.out = produced.get(p.id) ?? 0
        s.activity = b.capacity ? s.out / b.capacity : s.out > 0 ? 1 : 0
        s.starting = !!b.startup && called.has(p.id) && s.out <= EPS
        break
      case 'bus':
      case 'vent':
        s.activity = s.in > EPS ? 1 : 0
        break
    }
    s.activity = clamp01(s.activity)
    partStates[p.id] = s
  }

  const linkStates: LinkState[] = links.map((l, i) => ({
    flow: flow[i]!,
    capacity: l.capacity ?? Infinity,
  }))

  return { parts: partStates, links: linkStates }
}

export type Solution = ReturnType<typeof solve>

function ratio(a: number, b: number): number {
  return b > 0 ? a / b : 0
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
