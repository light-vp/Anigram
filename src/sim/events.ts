// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { compileExpr, NEVER } from './expr.ts'
import type { Compiled } from './expr.ts'
import type { Env, EventSpec, Scene } from './types.ts'

/*
 * Event chains: cause and effect, one link at a time. Each event watches a
 * condition over the parts as they are now; when it turns true the event
 * waits its `after`, then flips a switch or sets a knob — and the next event
 * in the chain watches for that with `fired('id')`. A tank filling trips a
 * float, the float starts a pump, the pump fills a second tank, and so on:
 * the literal Rube Goldberg machine, each step something the solver really
 * did rather than a scripted animation.
 *
 * An event's actions land between ticks, so a chain moves one tick per link
 * at the least, and a chain that loops back on itself cannot spin forever.
 * React-free; the runtime keeps the memory and replays it when the day is.
 */

export interface CompiledEvent {
  spec: EventSpec
  when: Compiled
}

/** what survives from one tick to the next, so a replayed day replays the chain too */
export interface EventMemory {
  /** the condition was false last time, so its turning true counts */
  armed: boolean[]
  /** run hour a waiting event acts at; NaN when it isn't waiting */
  due: number[]
  /** run hour each last fired, -Infinity before it has */
  last: number[]
  count: number[]
  /** events that fired in the last step, which `fired()` reads in this one */
  pulse: Set<string>
  /** what the events have set, over the scene's own controls */
  switches: Record<string, boolean>
  knobs: Record<string, number>
}

export function compileEvents(scene: Scene): CompiledEvent[] {
  return (scene.events ?? []).map((spec) => ({
    spec,
    when: compileExpr(spec.when),
  }))
}

export function initialEvents(events: CompiledEvent[]): EventMemory {
  return {
    armed: events.map(() => true),
    due: events.map(() => NaN),
    last: events.map(() => -Infinity),
    count: events.map(() => 0),
    pulse: new Set(),
    switches: {},
    knobs: {},
  }
}

export function cloneEvents(m: EventMemory): EventMemory {
  return {
    armed: [...m.armed],
    due: [...m.due],
    last: [...m.last],
    count: [...m.count],
    pulse: new Set(m.pulse),
    switches: { ...m.switches },
    knobs: { ...m.knobs },
  }
}

/** the readers an expression gets for the events, at run hour `now` */
export function eventReaders(
  events: CompiledEvent[],
  m: EventMemory,
  now: number,
): Pick<Env, 'fired' | 'since'> {
  const index = new Map(events.map((e, i) => [e.spec.id, i]))
  return {
    fired: (id) => (m.pulse.has(id) ? 1 : 0),
    since: (id) => {
      const i = index.get(id)
      const last = i === undefined ? -Infinity : m.last[i]!
      return Number.isFinite(last) ? now - last : NEVER
    },
  }
}

/**
 * Check every event against the parts as they are now, at run hour `now`,
 * and act on the ones whose time has come. Returns the ids that fired.
 */
export function stepEvents(
  events: CompiledEvent[],
  m: EventMemory,
  env: Env,
  now: number,
): string[] {
  const fired: string[] = []
  events.forEach((e, i) => {
    const { spec } = e
    const holds = !!e.when(env)
    const spent = !!spec.once && m.count[i]! > 0
    if (holds && m.armed[i] && !spent && Number.isNaN(m.due[i]!))
      m.due[i] = now + (spec.after ?? 0)
    m.armed[i] = !holds
    if (Number.isNaN(m.due[i]!) || m.due[i]! > now + 1e-9) return
    m.due[i] = NaN
    for (const a of spec.then) {
      if ('switch' in a) m.switches[a.switch] = a.on
      else m.knobs[a.knob] = a.value
    }
    m.last[i] = now
    m.count[i]! += 1
    fired.push(spec.id)
  })
  m.pulse = new Set(fired)
  return fired
}
