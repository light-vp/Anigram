// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import {
  cloneEvents,
  compileEvents,
  eventReaders,
  initialEvents,
  stepEvents,
} from './events.ts'
import type { CompiledEvent, EventMemory } from './events.ts'
import { compileReader } from './instruments.ts'
import type { Reader } from './instruments.ts'
import { cloneMemory, compile, initialMemory, solve } from './solver.ts'
import type { Compiled, LinkState, Memory, PartState } from './solver.ts'
import { effortUnit, formatEffort } from './effort.ts'
import type { Env, Scene } from './types.ts'

/** Everything the view needs to draw one instant. */
export interface Frame {
  hour: number
  day: number
  parts: Record<string, PartState>
  links: LinkState[]
  /** per-link dash travel and per-part rotation, accumulated so speed changes never jump */
  linkPhase: Float64Array
  partPhase: Record<string, number>
  alerts: Alert[]
  /** each instrument's reading, by tag */
  instruments: Record<string, number>
  /** each event in the scene's chain, by id */
  events: Record<string, EventStatus>
}

export interface EventStatus {
  /** times it has fired this run */
  count: number
  /** hours since it last fired; Infinity before it has */
  since: number
  /** its condition came true and it is waiting out its `after` */
  waiting: boolean
}

export interface Alert {
  partId: string
  kind: 'short' | 'empty' | 'limit' | 'effort'
  text: string
}

/** the largest slice of simulated time solved in one go, in hours */
const MAX_STEP = 1 / 30

/**
 * A running scene: the clock, the controls and the stores' memory. React-free;
 * the view subscribes and reads `frame`.
 */
export class Simulation {
  readonly scene: Scene
  readonly model: Compiled
  hour: number
  day = 0
  playing = true
  /** multiplier on the scene's own clock rate */
  speed = 1
  /** while false, flows still update but nothing on the sheet travels or spins */
  animate = true
  /** the controls as the person using the sheet set them; events can override them, see `knob()` and `switchOn()` */
  knobs: Record<string, number> = {}
  switches: Record<string, boolean> = {}
  frame: Frame
  /** simulated hours since the opening hour, which `since()` counts in */
  private elapsed = 0
  private memory: Memory
  private events: CompiledEvent[]
  private chain: EventMemory
  private readers: Reader[]
  private listeners = new Set<() => void>()
  /**
   * where a replayed day stood at each whole hour after the opening hour,
   * under the controls in `key`, so dragging the time slider re-runs at most
   * an hour of the day instead of all of it
   */
  private marks: { key: string; at: Map<number, Mark> } = {
    key: '',
    at: new Map(),
  }

  constructor(scene: Scene) {
    this.scene = scene
    this.model = compile(scene)
    this.hour = scene.clock.start
    for (const k of scene.knobs ?? []) this.knobs[k.id] = k.value
    for (const s of scene.switches ?? []) this.switches[s.id] = s.on
    this.memory = initialMemory(this.model)
    this.events = compileEvents(scene)
    this.chain = initialEvents(this.events)
    this.readers = (scene.instruments ?? []).flatMap(
      (i) => compileReader(i, scene) ?? [],
    )
    this.frame = this.emptyFrame()
    // settle the stores into a believable state before the first paint
    this.compute(1e-3)
  }

  /** a knob's value, after any event that set it */
  knob(id: string): number {
    return this.chain.knobs[id] ?? this.knobs[id] ?? 0
  }

  /** whether a switch is on, after any event that flipped it */
  switchOn(id: string): boolean {
    return this.chain.switches[id] ?? this.switches[id] ?? false
  }

  private env(): Env {
    return {
      hour: this.hour,
      day: this.day,
      knob: (id) => this.knob(id),
      on: (id) => this.switchOn(id),
      ...eventReaders(this.events, this.chain, this.elapsed),
      prev: (id) =>
        this.frame.parts[id] ?? { in: 0, out: 0, fill: 0, effort: NaN },
    }
  }

  private emptyFrame(): Frame {
    return {
      hour: this.hour,
      day: this.day,
      parts: {},
      links: [],
      linkPhase: new Float64Array(this.scene.links.length),
      partPhase: Object.fromEntries(this.scene.parts.map((p) => [p.id, 0])),
      alerts: [],
      instruments: {},
      events: this.eventStatus(),
    }
  }

  private eventStatus(): Record<string, EventStatus> {
    const out: Record<string, EventStatus> = {}
    this.events.forEach((e, i) => {
      const last = this.chain.last[i]!
      out[e.spec.id] = {
        count: this.chain.count[i]!,
        since: Number.isFinite(last) ? this.elapsed - last : Infinity,
        waiting: !Number.isNaN(this.chain.due[i]!),
      }
    })
    return out
  }

  /** advance by `seconds` of real time */
  tick(seconds: number): void {
    const s = Math.min(seconds, 0.1)
    if (this.playing) {
      let hours = s * this.scene.clock.rate * this.speed
      while (hours > 1e-9) {
        const dt = Math.min(hours, MAX_STEP)
        this.advanceClock(dt)
        this.compute(dt)
        hours -= dt
      }
    }
    // paused: the clock stops but the instant keeps flowing
    if (this.animate) this.spin(s)
    this.emit()
  }

  /**
   * run `hours` of simulated time forward, then move what travels along the
   * links as `seconds` of real time would: a recording's step, independent of
   * `playing` and `speed`
   */
  advance(hours: number, seconds = 0): void {
    let left = hours
    while (left > 1e-9) {
      const dt = Math.min(left, MAX_STEP)
      this.advanceClock(dt)
      this.compute(dt)
      left -= dt
    }
    this.spin(seconds)
    this.emit()
  }

  private advanceClock(dt: number) {
    this.elapsed += dt
    this.hour += dt
    if (this.hour >= 24) {
      this.hour -= 24
      this.day += 1
    }
  }

  /** solve one step; `advance: false` re-solves without moving the stores */
  private compute(dt: number, advance = true) {
    const memory: Memory = advance ? this.memory : cloneMemory(this.memory)
    const sol = solve(this.model, this.env(), dt, memory)
    // the chain watches the parts as they are now; what it sets takes hold
    // from the next tick
    if (advance && this.events.length)
      stepEvents(
        this.events,
        this.chain,
        { ...this.env(), part: (id) => sol.parts[id] ?? NOTHING },
        this.elapsed,
      )
    this.frame = {
      ...this.frame,
      hour: this.hour,
      day: this.day,
      parts: sol.parts,
      links: sol.links,
      alerts: this.alerts(sol.parts, sol.links),
      instruments: this.read(sol.parts),
      events: this.eventStatus(),
    }
  }

  /** what each instrument reads, from the parts as they are now */
  private read(parts: Record<string, PartState>): Record<string, number> {
    if (!this.readers.length) return {}
    const env: Env = {
      ...this.env(),
      part: (id) => parts[id] ?? NOTHING,
    }
    return Object.fromEntries(this.readers.map((r) => [r.tag, r.read(env)]))
  }

  private alerts(
    parts: Record<string, PartState>,
    links: LinkState[],
  ): Alert[] {
    const out: Alert[] = []
    for (const p of this.scene.parts) {
      const s = parts[p.id]!
      const b = p.behaviour
      if (
        b.role === 'sink' &&
        !b.absorbsSurplus &&
        s.demand > 0 &&
        s.in < s.demand * 0.97
      ) {
        const pct = Math.round((1 - s.in / s.demand) * 100)
        out.push({
          partId: p.id,
          kind: 'short',
          text: `${p.label}: ${pct}% short`,
        })
      }
      if (b.role === 'storage') {
        if (s.fill < 0.02 && b.capacity < 1e5)
          out.push({ partId: p.id, kind: 'empty', text: `${p.label}: empty` })
      }
      const e = p.effort
      if (e && (e.min !== undefined || e.max !== undefined)) {
        const at = s.effort
        // a sink asking for nothing doesn't mind what pressure is behind it
        const idle = p.behaviour.role === 'sink' && s.demand <= 0
        const low = e.min !== undefined && at < e.min && !idle
        const high = e.max !== undefined && at > e.max
        if (low || high) {
          const unit = effortUnit(this.scene, p.id)
          out.push({
            partId: p.id,
            kind: 'effort',
            text: `${p.label}: ${formatEffort(at, unit)}, ${low ? `below its ${formatEffort(e.min!, unit)}` : `above its ${formatEffort(e.max!, unit)}`}`,
          })
        }
      }
    }
    this.scene.links.forEach((l, i) => {
      const st = links[i]!
      if (
        Number.isFinite(st.capacity) &&
        st.flow >= st.capacity * 0.995 &&
        st.flow > 0
      ) {
        const from = this.model.parts.get(l.from)!.label
        const to = this.model.parts.get(l.to)!.label
        out.push({
          partId: l.to,
          kind: 'limit',
          text: `${from} → ${to}: at its limit`,
        })
      }
    })
    return out
  }

  /** advance the visual phases from the current flows */
  private spin(seconds: number) {
    const f = this.frame
    this.scene.links.forEach((l, i) => {
      const st = f.links[i]
      if (!st) return
      const scale = this.scene.scale[l.domain] ?? 100
      const rel = Math.min(1.5, st.flow / scale)
      // a trickle still visibly moves; a full pipe races
      const speed = rel > 1e-4 ? 18 + 90 * Math.sqrt(rel) : 0
      f.linkPhase[i] = (f.linkPhase[i]! + speed * seconds) % 1e6
    })
    for (const p of this.scene.parts) {
      const a = f.parts[p.id]?.activity ?? 0
      f.partPhase[p.id] = ((f.partPhase[p.id] ?? 0) + a * 300 * seconds) % 360
    }
  }

  setKnob(id: string, value: number) {
    // the person takes the control back from the chain
    delete this.chain.knobs[id]
    this.knobs[id] = value
    this.refresh()
  }

  toggle(id: string) {
    this.switches[id] = !this.switchOn(id)
    delete this.chain.switches[id]
    this.refresh()
  }

  /**
   * Jump to an hour of the day. The day is replayed from the opening hour
   * under the current controls, so batteries and tanks show the level they
   * would really have reached by then — the same frame `render_scene` draws.
   */
  seek(hour: number) {
    const start = this.scene.clock.start
    const target = wrap24(hour)
    const ahead = wrap24(target - start)
    const steps = Math.floor(ahead / MAX_STEP + 1e-6)

    const key = JSON.stringify([this.knobs, this.switches])
    if (this.marks.key !== key) this.marks = { key, at: new Map() }
    const perHour = Math.round(1 / MAX_STEP)
    let from = Math.floor(steps / perHour)
    while (from > 0 && !this.marks.at.has(from)) from--
    const mark = this.marks.at.get(from)

    this.day = 0
    if (mark) {
      this.memory = cloneMemory(mark.memory)
      this.chain = cloneEvents(mark.chain)
      this.frame = { ...this.emptyFrame(), parts: mark.parts }
    } else {
      this.memory = initialMemory(this.model)
      this.chain = initialEvents(this.events)
      this.frame = this.emptyFrame()
    }
    this.hour = start
    this.elapsed = from * perHour * MAX_STEP
    if (!mark) this.compute(1e-3)
    for (let i = from * perHour; i < steps; i++) {
      // the clock is set from the step count, so a replay never drifts
      this.hour = wrap24(start + (i + 1) * MAX_STEP)
      this.elapsed = (i + 1) * MAX_STEP
      this.compute(MAX_STEP)
      if ((i + 1) % perHour === 0 && !this.marks.at.has((i + 1) / perHour))
        this.marks.at.set((i + 1) / perHour, {
          memory: cloneMemory(this.memory),
          chain: cloneEvents(this.chain),
          parts: this.frame.parts,
        })
    }
    // the last part of a step, so the clock lands exactly on the hour asked for
    const rest = ahead - steps * MAX_STEP
    this.hour = target
    this.elapsed = ahead
    if (rest > 1e-9) this.compute(rest)
    this.emit()
  }

  setPlaying(playing: boolean) {
    this.playing = playing
    this.emit()
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.emit()
  }

  /** start the scene over: clock, controls and stores */
  reset() {
    this.hour = this.scene.clock.start
    this.day = 0
    for (const k of this.scene.knobs ?? []) this.knobs[k.id] = k.value
    for (const s of this.scene.switches ?? []) this.switches[s.id] = s.on
    this.memory = initialMemory(this.model)
    this.chain = initialEvents(this.events)
    this.elapsed = 0
    this.frame = this.emptyFrame()
    this.compute(1e-3)
    this.emit()
  }

  private refresh() {
    this.compute(1e-3, false)
    this.emit()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getFrame = () => this.frame

  private emit() {
    // a new object identity per emit, so useSyncExternalStore re-renders
    this.frame = { ...this.frame }
    for (const fn of this.listeners) fn()
  }
}

interface Mark {
  memory: Memory
  chain: EventMemory
  parts: Frame['parts']
}

const NOTHING = { in: 0, out: 0, fill: 0, demand: 0, effort: NaN }

function wrap24(hour: number): number {
  return ((hour % 24) + 24) % 24
}
