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
 *
 * Sinks of equal priority share a shortfall in proportion to what they ask
 * for: each gets the same fraction of its demand, unless something only it
 * sits behind (a breaker, a thin cable) holds it lower, and then the rest
 * share what it couldn't take.
 *
 * Big sheets stay quick because everything the pull touches is worked out
 * once, when the scene compiles: parts and links become numbers, inputs are
 * sorted cheapest first, and every signal is read once a tick rather than
 * once an ask. A part that has run dry is remembered as dry, so the hundredth
 * house asking an empty feeder stops at the feeder.
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

const DOMAINS: Domain[] = [
  'light',
  'electric',
  'water',
  'heat',
  'fuel',
  'mechanical',
  'data',
]
const D = DOMAINS.length
const domainIndex = new Map(DOMAINS.map((d, i) => [d, i]))

export interface Compiled {
  scene: Scene
  parts: Map<string, PartSpec>
  links: LinkSpec[]
  /** everything below is the solver's own, by part and link number */
  index: Map<string, number>
  list: PartSpec[]
  /** each link's ends, domain number and capacity */
  from: Int32Array
  to: Int32Array
  dom: Int32Array
  cap: Float64Array
  /** firm links arriving at each part, cheapest source first */
  inputs: Int32Array[]
  /** loss links leaving each converter */
  lossLinks: Int32Array[]
  /** a converter's recipe, as domain numbers and amounts, in the scene's order */
  recipe: Array<Array<[number, number]>>
  /** sinks grouped by priority, highest first; surplus-only sinks; stores */
  groups: Int32Array[]
  surplusSinks: Int32Array
  stores: Int32Array
  converters: Int32Array
  /**
   * every part each sink can draw from, for guessing where a shared
   * shortfall settles; empty when the sheet is too tangled to be worth it
   */
  upstream: Int32Array[]
}

export function read(signal: Signal, env: Env): number {
  if (typeof signal === 'number') return signal
  return typeof signal === 'string' ? compileExpr(signal)(env) : signal(env)
}

export function compile(scene: Scene): Compiled {
  const list = scene.parts
  const parts = new Map(list.map((p) => [p.id, p]))
  const index = new Map(list.map((p, i) => [p.id, i]))
  const n = list.length
  const L = scene.links.length
  const from = new Int32Array(L)
  const to = new Int32Array(L)
  const dom = new Int32Array(L)
  const cap = new Float64Array(L)
  const inputs: number[][] = list.map(() => [])
  const lossLinks: number[][] = list.map(() => [])
  scene.links.forEach((l, i) => {
    const f = index.get(l.from)
    const t = index.get(l.to)
    if (f === undefined || t === undefined) {
      throw new Error(
        `${scene.id}: link ${l.from} → ${l.to} names a part that doesn't exist`,
      )
    }
    from[i] = f
    to[i] = t
    dom[i] = domainIndex.get(l.domain) ?? 0
    cap[i] = l.capacity ?? Infinity
    if (l.loss) lossLinks[f]!.push(i)
    else inputs[t]!.push(i)
  })

  // Merit order: renewables 0, stores 10, anything that burns fuel 20. A
  // pass-through part costs what its cheapest input costs.
  const merit = new Float64Array(n).fill(NaN)
  const meritOf = (k: number, seen: Set<number>): number => {
    if (!Number.isNaN(merit[k]!)) return merit[k]!
    const b = list[k]!.behaviour
    let m: number
    if (b.role === 'source') m = b.merit ?? (b.dispatchable ? 20 : 0)
    else if (b.role === 'storage') m = b.merit ?? 10
    else {
      if (seen.has(k)) return 99
      seen.add(k)
      const ins = inputs[k]!.map((i) => meritOf(from[i]!, seen))
      m = ins.length ? Math.min(...ins) : 99
    }
    merit[k] = m
    return m
  }
  for (let k = 0; k < n; k++) meritOf(k, new Set())
  for (const ins of inputs) {
    ins.sort((a, b) => merit[from[a]!]! - merit[from[b]!]!)
  }

  const sinkPriority = new Map<number, number[]>()
  const surplusSinks: number[] = []
  const stores: number[] = []
  const converters: number[] = []
  list.forEach((p, k) => {
    const b = p.behaviour
    if (b.role === 'sink') {
      if (b.absorbsSurplus) surplusSinks.push(k)
      else {
        const pr = b.priority ?? 0
        sinkPriority.set(pr, [...(sinkPriority.get(pr) ?? []), k])
      }
    }
    if (b.role === 'storage') stores.push(k)
    if (b.role === 'converter') converters.push(k)
  })

  // what each sink can reach going upstream, through anything but a store
  // (a store answers a pull without passing it on)
  const upstream: Int32Array[] = list.map(() => new Int32Array(0))
  let reach = 0
  for (const [k, p] of list.entries()) {
    if (p.behaviour.role !== 'sink' || p.behaviour.absorbsSurplus) continue
    const seen = new Set<number>()
    const todo = [k]
    while (todo.length && reach < 1e6) {
      const x = todo.pop()!
      for (const i of inputs[x]!) {
        const y = from[i]!
        if (seen.has(y)) continue
        seen.add(y)
        reach++
        if (list[y]!.behaviour.role !== 'storage') todo.push(y)
      }
    }
    upstream[k] = Int32Array.from(seen)
  }

  return {
    scene,
    parts,
    links: scene.links,
    index,
    list,
    from,
    to,
    dom,
    cap,
    inputs: inputs.map((x) => Int32Array.from(x)),
    lossLinks: lossLinks.map((x) => Int32Array.from(x)),
    recipe: list.map((p) =>
      p.behaviour.role === 'converter'
        ? (Object.entries(p.behaviour.recipe) as Array<[Domain, number]>).map(
            ([d, per]) => [domainIndex.get(d) ?? 0, per] as [number, number],
          )
        : [],
    ),
    groups: [...sinkPriority.keys()]
      .sort((a, b) => b - a)
      .map((pr) => Int32Array.from(sinkPriority.get(pr)!)),
    surplusSinks: Int32Array.from(surplusSinks),
    stores: Int32Array.from(stores),
    converters: Int32Array.from(converters),
    upstream: reach < 1e6 ? upstream : list.map(() => new Int32Array(0)),
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
  for (const k of model.stores) {
    const p = model.list[k]!
    const b = p.behaviour as Extract<Behaviour, { role: 'storage' }>
    level.set(p.id, b.capacity * (b.start ?? 0.5))
    refilling.set(p.id, false)
  }
  return { level, refilling, warm: new Map() }
}

const EPS = 1e-9
/** how close a shared shortfall's fraction is pinned before it settles */
const SHARE_TOLERANCE = 1e-6

/**
 * Resolve every flow for one tick of `dt` simulated hours and advance the
 * stores. Pure apart from `memory`, which it updates in place.
 */
export function solve(model: Compiled, env: Env, dt: number, memory: Memory) {
  const { list, links, from, dom, cap, inputs } = model
  const n = list.length
  const L = links.length

  // every signal, read once for the whole tick
  const output = new Float64Array(n) // sources: output; stores: max out
  const gateCap = new Float64Array(n) // gates: capacity × open; stores: max in
  const open = new Float64Array(n).fill(1)
  const demand = new Float64Array(n)
  const level = new Float64Array(n)
  const warm = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const p = list[k]!
    const b = p.behaviour
    switch (b.role) {
      case 'source':
        output[k] = read(b.output, env)
        break
      case 'storage':
        output[k] = read(b.maxOut, env)
        gateCap[k] = read(b.maxIn, env)
        level[k] = memory.level.get(p.id)!
        break
      case 'gate':
        open[k] = clamp01(read(b.open ?? 1, env))
        gateCap[k] = b.capacity * open[k]!
        break
      case 'sink':
        demand[k] = Math.max(0, read(b.demand, env))
        break
      case 'converter':
        if (b.startup) warm[k] = memory.warm.get(p.id) ?? 0
        break
    }
  }

  // the state a pull changes, flat so a shared shortfall can try a share
  // and take it back
  const state = new Float64Array(L + n * (D + 2))
  const flow = state.subarray(0, L)
  /** what a part has already handed out this tick */
  const used = state.subarray(L, L + n)
  const produced = state.subarray(L + n, L + 2 * n)
  /** what arrived at each part, by domain */
  const inBy = state.subarray(L + 2 * n)
  /** 1: ran dry this tick in firm mode (and so in surplus too); 2: in surplus */
  const dry = new Uint8Array(n)
  const called = new Uint8Array(n)
  const onStack = new Uint8Array(n)
  /** how many pulls have hit a part already on the stack */
  let blocked = 0

  const pullInputs = (
    k: number,
    amount: number,
    mode: Mode,
    domain = -1,
  ): number => {
    let remaining = amount
    for (const i of inputs[k]!) {
      if (remaining <= EPS) break
      if (domain >= 0 && dom[i] !== domain) continue
      const ask = Math.min(remaining, cap[i]! - flow[i]!)
      if (ask <= EPS) continue
      const got = pull(from[i]!, ask, mode)
      flow[i]! += got
      remaining -= got
      inBy[k * D + dom[i]!]! += got
    }
    return amount - remaining
  }

  /** ask part `k` to deliver `amount` at its output; returns what it delivered */
  const pull = (k: number, amount: number, mode: Mode): number => {
    if (amount <= EPS) return 0
    if (onStack[k]) {
      blocked++
      return 0
    }
    if (dry[k] === 1 || (dry[k] === 2 && mode === 'surplus')) return 0
    const b = list[k]!.behaviour
    const spent = used[k]!
    const was = blocked
    let got = 0
    onStack[k] = 1
    switch (b.role) {
      case 'source': {
        if (mode === 'surplus' && b.dispatchable) break
        got = Math.min(amount, Math.max(0, output[k]! - spent))
        break
      }
      case 'storage': {
        if (mode === 'surplus') break
        got = Math.min(
          amount,
          Math.max(0, Math.min(output[k]!, level[k]! / dt) - spent),
        )
        break
      }
      case 'gate':
        got = pullInputs(
          k,
          Math.min(amount, Math.max(0, gateCap[k]! - spent)),
          mode,
        )
        break
      case 'bus':
        got = pullInputs(k, amount, mode)
        break
      case 'converter': {
        if (b.startup) {
          // only a real shortfall cranks a generator; a store topping up
          // from surplus walks past it without waking it
          if (mode === 'firm') called[k] = 1
          if (warm[k]! < b.startup) break
        }
        let can = Math.min(
          amount,
          Math.max(0, (b.capacity ?? Infinity) - spent),
        )
        for (const [d, per] of model.recipe[k]!) {
          if (can <= EPS) break
          const arrived = pullInputs(k, can * per, mode, d)
          can = Math.min(can, arrived / per)
        }
        got = can
        break
      }
      case 'sink':
      case 'vent':
        break
    }
    onStack[k] = 0
    used[k] = spent + got
    produced[k]! += got
    // short, and not because of a loop back through a part already asking:
    // nothing it can reach has any more this tick
    if (amount - got > EPS && blocked === was)
      dry[k] = mode === 'firm' ? 1 : Math.max(dry[k]!, 2)
    return got
  }

  const save = () => ({
    state: state.slice(),
    dry: dry.slice(),
    called: called.slice(),
  })
  type Saved = ReturnType<typeof save>
  const restore = (s: Saved) => {
    state.set(s.state)
    dry.set(s.dry)
    called.set(s.called)
  }

  // 1. Firm demand, highest priority first. A group that can all be served
  //    is served in one pass; otherwise its members share the shortfall.
  for (const group of model.groups) {
    const before = save()
    let short = false
    for (const k of group) {
      if (pullInputs(k, demand[k]!, 'firm') < demand[k]! - EPS) short = true
    }
    if (short) {
      restore(before)
      share(group)
    }
  }

  /**
   * Serve a group that can't all be served: raise one fraction of demand
   * for everyone as far as it goes, hold whoever can't go further at that
   * fraction, and keep raising the rest.
   */
  function share(group: Int32Array) {
    const start = save()
    /** the fraction a member is held at, or -1 while it is still rising */
    const held = new Float64Array(n).fill(-1)
    const got = new Float64Array(n)
    const isFree = (k: number) => held[k]! < 0
    /** serve every member at fraction `f`; true if all the free ones got it */
    const serve = (f: number, failed?: Set<number>): boolean => {
      restore(start)
      let ok = true
      for (const k of group) {
        const ask = (isFree(k) ? f : held[k]!) * demand[k]!
        got[k] = pullInputs(k, ask, 'firm')
        if (isFree(k) && ask - got[k]! > EPS * Math.max(1, ask)) {
          ok = false
          failed?.add(k)
        }
      }
      return ok
    }
    /**
     * where the fraction is likely to settle: for each part that ran dry
     * behind a member left short, what came through it over what its free
     * members asked. The lowest is often the first bottleneck to bind.
     */
    const guesses = (failed: Set<number>): number[] => {
      const behind = new Set<number>()
      for (const k of failed)
        for (const x of model.upstream[k]!) if (dry[x] === 1) behind.add(x)
      const asked = new Map<number, number>()
      const came = new Map<number, number>()
      for (const k of group) {
        if (!isFree(k)) continue
        for (const x of model.upstream[k]!) {
          if (!behind.has(x)) continue
          asked.set(x, (asked.get(x) ?? 0) + demand[k]!)
          came.set(x, (came.get(x) ?? 0) + got[k]!)
        }
      }
      return [...asked].map(([x, a]) => came.get(x)! / a)
    }

    let lo = 0
    /** fractions to try next, lowest first; refilled from a full ask */
    let queue: number[] = []
    for (let round = 0; round <= group.length; round++) {
      let hi = 1
      let want = 0
      for (const k of group) if (isFree(k)) want += demand[k]!
      while (queue.length && !(queue[0]! > lo)) queue.shift()
      if (!queue.length) {
        const short = new Set<number>()
        if (serve(hi, short)) return
        // and a total shortfall behind one bottleneck: everyone gets the
        // same share of what came through
        let total = 0
        for (const k of group) if (isFree(k)) total += got[k]!
        queue = [...guesses(short), total / want]
          .filter((g) => g > lo)
          .sort((a, b) => a - b)
      }
      let failed = new Set<number>()
      for (const guess of queue) {
        if (!(guess > lo && guess < hi)) continue
        if (!serve(guess)) {
          hi = guess
          continue
        }
        lo = guess
        if (hi - lo > SHARE_TOLERANCE) {
          const f = new Set<number>()
          if (serve(lo + SHARE_TOLERANCE, f)) continue
          hi = lo + SHARE_TOLERANCE
          failed = f
        }
        break
      }
      queue = queue.filter((g) => g > hi)
      while (hi - lo > SHARE_TOLERANCE) {
        const mid = (lo + hi) / 2
        const f = new Set<number>()
        if (serve(mid, f)) lo = mid
        else {
          hi = mid
          failed = f
        }
      }
      if (!failed.size && hi < 1) serve(hi, failed)
      serve(lo)
      // who is held at `lo`: ask each free member for a little more than
      // the slack the tolerance leaves, and see who can't get it
      const atLo = save()
      const extra = 4 * SHARE_TOLERANCE * want
      const stuck: number[] = []
      for (const k of group) {
        if (!isFree(k)) continue
        const ask = Math.min(extra, (1 - lo) * demand[k]!)
        if (pullInputs(k, ask, 'firm') < ask - EPS) stuck.push(k)
      }
      restore(atLo)
      for (const k of stuck.length ? stuck : failed) held[k] = lo
      if (!stuck.length && !failed.size) {
        // nothing binds below a full share any more
        serve(1)
        return
      }
      if (!group.some(isFree)) return
    }
    serve(lo)
  }

  // 2. Stores charge — from surplus, or (float switch) from anything.
  const charged = new Float64Array(n)
  for (const k of model.stores) {
    const p = list[k]!
    const b = p.behaviour as Extract<Behaviour, { role: 'storage' }>
    let mode: Mode = 'surplus'
    if (b.refill) {
      const fill = level[k]! / b.capacity
      let on = memory.refilling.get(p.id)!
      if (fill <= b.refill.below) on = true
      if (fill >= b.refill.until) on = false
      memory.refilling.set(p.id, on)
      if (!on) continue
      mode = 'firm'
    }
    const room = (b.capacity - level[k]!) / dt / (b.efficiency ?? 1)
    // on the stack while it charges, so it can't discharge into itself
    onStack[k] = 1
    charged[k] = pullInputs(k, Math.min(gateCap[k]!, room), mode)
    onStack[k] = 0
  }

  // 3. Whatever is still unclaimed goes to export / spill.
  for (const k of model.surplusSinks) pullInputs(k, demand[k]!, 'surplus')

  // 4. What goes in and doesn't come out as product leaves along loss links.
  //    Energy: an energy product's loss is energy in minus energy out; a
  //    converter whose product isn't energy (a server makes requests) turns
  //    every watt into heat. Matter passes through: a turbine's water leaves
  //    down the tailrace on a water loss link. A pump with no loss link loses
  //    nothing worth drawing — its work went into lifting the water.
  const loss = new Float64Array(n)
  for (const k of model.converters) {
    const b = list[k]!.behaviour as Extract<Behaviour, { role: 'converter' }>
    const outs = model.lossLinks[k]!
    const energyOut = ENERGY_DOMAINS.has(b.output)
    let energyLinks = 0
    for (const i of outs)
      if (ENERGY_DOMAINS.has(links[i]!.domain)) energyLinks++
    if (energyOut || energyLinks) {
      let energyIn = 0
      for (let d = 0; d < D; d++)
        if (ENERGY_DOMAINS.has(DOMAINS[d]!)) energyIn += inBy[k * D + d]!
      const lost = Math.max(0, energyIn - (energyOut ? produced[k]! : 0))
      loss[k] = lost
      for (const i of outs)
        if (ENERGY_DOMAINS.has(links[i]!.domain)) flow[i] = lost / energyLinks
    }
    for (const i of outs) {
      if (ENERGY_DOMAINS.has(links[i]!.domain)) continue
      let same = 0
      for (const j of outs) if (dom[j] === dom[i]) same++
      flow[i] = inBy[k * D + dom[i]!]! / same
    }
  }

  // 5. Advance the stores.
  for (const k of model.stores) {
    const p = list[k]!
    const b = p.behaviour as Extract<Behaviour, { role: 'storage' }>
    const next =
      level[k]! + (charged[k]! * (b.efficiency ?? 1) - produced[k]!) * dt
    memory.level.set(p.id, Math.min(b.capacity, Math.max(0, next)))
  }

  for (const k of model.converters) {
    const p = list[k]!
    if (!(p.behaviour as { startup?: number }).startup) continue
    memory.warm.set(p.id, called[k] ? warm[k]! + dt : 0)
  }

  // 6. Read the state back off the links.
  const inflow = new Float64Array(n)
  const outflow = new Float64Array(n)
  for (let i = 0; i < L; i++) {
    outflow[from[i]!]! += flow[i]!
    inflow[model.to[i]!]! += flow[i]!
  }

  const partStates: Record<string, PartState> = {}
  for (let k = 0; k < n; k++) {
    const p = list[k]!
    const b = p.behaviour
    const s: PartState = {
      in: inflow[k]!,
      out: outflow[k]!,
      demand: demand[k]!,
      avail: 0,
      level: memory.level.get(p.id) ?? 0,
      fill: 0,
      loss: loss[k]!,
      open: 1,
      starting: false,
      activity: 0,
    }
    switch (b.role) {
      case 'source':
        s.avail = output[k]!
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
          ratio(s.in, gateCap[k]!),
          ratio(s.out, output[k]!),
        )
        break
      case 'gate':
        s.open = open[k]!
        s.activity = ratio(s.out, b.capacity)
        break
      case 'converter':
        // product only — the loss links' flow is reported as `loss`
        s.out = produced[k]!
        s.activity = b.capacity ? s.out / b.capacity : s.out > 0 ? 1 : 0
        s.starting = !!b.startup && !!called[k] && s.out <= EPS
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
