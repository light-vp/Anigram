// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { compile, initialMemory, solve } from './solver.ts'
import type { Compiled, LinkState, Memory, PartState } from './solver.ts'
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
}

export interface Alert {
  partId: string
  kind: 'short' | 'empty' | 'limit'
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
  knobs: Record<string, number> = {}
  switches: Record<string, boolean> = {}
  frame: Frame
  private memory: Memory
  private listeners = new Set<() => void>()

  constructor(scene: Scene) {
    this.scene = scene
    this.model = compile(scene)
    this.hour = scene.clock.start
    for (const k of scene.knobs ?? []) this.knobs[k.id] = k.value
    for (const s of scene.switches ?? []) this.switches[s.id] = s.on
    this.memory = initialMemory(this.model)
    this.frame = this.emptyFrame()
    // settle the stores into a believable state before the first paint
    this.compute(1e-3)
  }

  private env(): Env {
    return {
      hour: this.hour,
      day: this.day,
      knob: (id) => this.knobs[id] ?? 0,
      on: (id) => this.switches[id] ?? false,
      prev: (id) => this.frame.parts[id] ?? { in: 0, out: 0, fill: 0 },
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
    }
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

  private advanceClock(dt: number) {
    this.hour += dt
    if (this.hour >= 24) {
      this.hour -= 24
      this.day += 1
    }
  }

  /** solve one step; `advance: false` re-solves without moving the stores */
  private compute(dt: number, advance = true) {
    const memory: Memory = advance
      ? this.memory
      : {
          level: new Map(this.memory.level),
          refilling: new Map(this.memory.refilling),
          warm: new Map(this.memory.warm),
        }
    const sol = solve(this.model, this.env(), dt, memory)
    this.frame = {
      ...this.frame,
      hour: this.hour,
      day: this.day,
      parts: sol.parts,
      links: sol.links,
      alerts: this.alerts(sol.parts, sol.links),
    }
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
    this.knobs[id] = value
    this.refresh()
  }

  toggle(id: string) {
    this.switches[id] = !this.switches[id]
    this.refresh()
  }

  seek(hour: number) {
    this.hour = ((hour % 24) + 24) % 24
    this.refresh()
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
