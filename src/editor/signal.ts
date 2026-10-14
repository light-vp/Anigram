// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { ExprError, compileExpr, exprRefs } from '../sim/expr.ts'
import { didYouMean } from '../sim/suggest.ts'
import type { Env } from '../sim/types.ts'
import type { Doc } from './doc.ts'

/*
 * A signal as someone types it: whether it parses, whether everything it
 * names exists on this sheet, and what it comes to over the day. The same
 * rules the validator applies to a file, said while the field still has the
 * cursor in it.
 */

export interface SignalCheck {
  ok: boolean
  /** the value to store: a number when the text is one, else the expression */
  value?: number | string
  /** what is wrong, and where */
  message?: string
  /** the character the problem starts at, when there is one */
  at?: number
  /** its value at each whole hour of the opening day, controls as they are now */
  day?: number[]
}

export function checkSignal(text: string, doc: Doc): SignalCheck {
  const src = text.trim()
  if (!src) return { ok: false, message: 'Write a number or an expression.' }
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(src)) {
    const n = Number(src)
    return { ok: true, value: n, day: Array(24).fill(n) }
  }
  let refs
  try {
    refs = exprRefs(src)
  } catch (e) {
    if (e instanceof ExprError)
      return { ok: false, message: e.message, at: e.at }
    throw e
  }
  const knobs = (doc.knobs ?? []).map((k) => k.id)
  const switches = (doc.switches ?? []).map((w) => w.id)
  const parts = doc.parts.map((p) => p.id)
  for (const k of refs.knobs)
    if (!knobs.includes(k))
      return {
        ok: false,
        message: `knob('${k}'): no slider has that id${didYouMean(k, knobs)}`,
      }
  for (const w of refs.switches)
    if (!switches.includes(w))
      return {
        ok: false,
        message: `on('${w}'): no switch has that id${didYouMean(w, switches)}`,
      }
  for (const p of refs.parts)
    if (!parts.includes(p))
      return {
        ok: false,
        message: `prev('${p}'): no part has that id${didYouMean(p, parts)}`,
      }
  for (const p of refs.reads)
    return {
      ok: false,
      message: `part('${p}') only works in a check; a signal reads another part with prev('${p}')`,
    }
  const fn = compileExpr(src)
  const env = (hour: number): Env => ({
    hour,
    day: 0,
    knob: (id) => doc.knobs?.find((k) => k.id === id)?.value ?? 0,
    on: (id) => doc.switches?.find((w) => w.id === id)?.on ?? false,
    prev: () => ({ in: 0, out: 0, fill: 0, effort: NaN }),
  })
  return {
    ok: true,
    value: src,
    day: Array.from({ length: 24 }, (_, h) => fn(env(h))),
  }
}
