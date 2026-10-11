// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import {
  bump,
  city,
  heating,
  home,
  rain,
  shift,
  sun,
  traffic,
  water,
  wind,
} from './profiles.ts'
import { didYouMean } from './suggest.ts'
import type { Env } from './types.ts'

/*
 * Signals as small expressions, so a scene is plain JSON:
 *
 *   "32 * sun(hour) * (1 - 0.85 * knob('cloud'))"
 *   "on('mains') ? 1 : 0"
 *   "between(hour, 16.5, 21.5) ? 360 : 0"
 *   "0.35 * prev('servers').in"
 *
 * The language is arithmetic, comparisons, `&&` `||` `!`, a ternary, and a
 * fixed set of functions. There is no assignment, no loops, no property access
 * except `.in` `.out` `.fill` on `prev()` (and `.demand` on `part()`, which
 * only a scene's `expect` checks can use), and nothing reaches JavaScript — it
 * is parsed here and evaluated by walking the tree, so a scene file from a
 * stranger can't run code.
 */

export type Compiled = (env: Env) => number

/** what an expression reads, for validation: which knobs, switches and parts */
export interface Refs {
  knobs: Set<string>
  switches: Set<string>
  /** read with prev() */
  parts: Set<string>
  /** read with part(), which only `expect` checks may use */
  reads: Set<string>
}

export class ExprError extends Error {
  readonly at: number
  constructor(message: string, at: number) {
    super(message)
    this.at = at
  }
}

/** the day curves and maths a signal can call, with their arity */
export const FUNCTIONS: Record<
  string,
  { args: [number, number]; doc: string; fn?: (...a: number[]) => number }
> = {
  sun: {
    args: [1, 1],
    doc: 'sunlight 0..1: up at 6, peak at 13, down at 20',
    fn: sun,
  },
  home: {
    args: [1, 1],
    doc: 'one home’s demand: base, breakfast, an evening peak',
    fn: home,
  },
  city: {
    args: [1, 1],
    doc: 'a city’s demand: smoother, still a 6pm peak',
    fn: city,
  },
  shift: { args: [1, 1], doc: 'a factory shift, 7 till 19', fn: shift },
  water: {
    args: [1, 1],
    doc: 'water use: showers in the morning, baths in the evening',
    fn: water,
  },
  heating: {
    args: [1, 1],
    doc: 'space heating: early burst, evening, colder at night',
    fn: heating,
  },
  traffic: {
    args: [1, 1],
    doc: 'web traffic: quiet before dawn, busiest at 9pm',
    fn: traffic,
  },
  rain: {
    args: [1, 1],
    doc: 'rain on a catchment: an afternoon storm',
    fn: rain,
  },
  wind: {
    args: [1, 2],
    doc: 'gusty wind 0.15..1; wind(hour, day)',
    fn: (h, d) => wind(h!, d ?? 0),
  },
  bump: {
    args: [3, 3],
    doc: 'bump(hour, at, width): a smooth 0..1 hump centred on `at`',
    fn: bump,
  },
  between: {
    args: [3, 3],
    doc: 'between(hour, from, to): 1 inside [from, to), wrapping past midnight',
    fn: (h, a, b) =>
      a! <= b! ? +(h! >= a! && h! < b!) : +(h! >= a! || h! < b!),
  },
  min: { args: [1, 8], doc: 'smallest argument', fn: Math.min },
  max: { args: [1, 8], doc: 'largest argument', fn: Math.max },
  clamp: {
    args: [3, 3],
    doc: 'clamp(x, lo, hi)',
    fn: (x, lo, hi) => Math.min(hi!, Math.max(lo!, x!)),
  },
  abs: { args: [1, 1], doc: '|x|', fn: Math.abs },
  floor: { args: [1, 1], doc: 'round down', fn: Math.floor },
  ceil: { args: [1, 1], doc: 'round up', fn: Math.ceil },
  round: { args: [1, 1], doc: 'round to nearest', fn: Math.round },
  sqrt: { args: [1, 1], doc: 'square root', fn: Math.sqrt },
  pow: { args: [2, 2], doc: 'pow(x, y)', fn: Math.pow },
  sin: { args: [1, 1], doc: 'sine (radians)', fn: Math.sin },
  cos: { args: [1, 1], doc: 'cosine (radians)', fn: Math.cos },
  knob: { args: [1, 1], doc: "knob('id'): a slider's value" },
  on: { args: [1, 1], doc: "on('id'): 1 if a switch is on, else 0" },
  prev: {
    args: [1, 1],
    doc: "prev('id').in | .out | .fill: another part as it was last tick",
  },
  part: {
    args: [1, 1],
    doc: "part('id').in | .out | .fill | .demand: a part right now — only in a scene's `expect` checks",
  },
}

const PREV_FIELDS: readonly Field[] = ['in', 'out', 'fill']
const PART_FIELDS: readonly Field[] = ['in', 'out', 'fill', 'demand']
const fieldList = (fs: readonly Field[]) =>
  fs
    .map((f) => `.${f}`)
    .join(', ')
    .replace(/, ([^,]*)$/, ' or $1')

/** names an expression can read without calling anything */
export const VARIABLES: Record<string, string> = {
  hour: 'time of day, 0–24, fractional',
  day: 'whole days since the scene opened',
  pi: 'π',
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string; at: number }
  | { t: 'var'; name: string; at: number }
  | { t: 'call'; name: string; args: Node[]; at: number }
  | { t: 'field'; of: Node; name: Field; at: number }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'if'; c: Node; a: Node; b: Node }

type Field = 'in' | 'out' | 'fill' | 'demand'

type Tok = { k: 'num' | 'str' | 'id' | 'op' | 'end'; v: string; at: number }

const OPS = [
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '?',
  ':',
  '(',
  ')',
  ',',
  '.',
]

function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    const at = i
    if (/[0-9.]/.test(c) && !(c === '.' && !/[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!
      out.push({ k: 'num', v: m[0], at })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      out.push({ k: 'id', v: m[0], at })
      i += m[0].length
      continue
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw new ExprError('unterminated string', at)
      out.push({ k: 'str', v: src.slice(i + 1, end), at })
      i = end + 1
      continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (!op) throw new ExprError(`unexpected “${c}”`, at)
    out.push({ k: 'op', v: op, at })
    i += op.length
  }
  out.push({ k: 'end', v: '', at: src.length })
  return out
}

/** longest expression accepted, in characters */
export const MAX_EXPR_LENGTH = 2000
/** deepest nesting accepted: brackets, ternaries, unary signs */
const MAX_DEPTH = 64

function parse(src: string): Node {
  if (src.length > MAX_EXPR_LENGTH)
    throw new ExprError(
      `is ${src.length} characters long; keep a signal under ${MAX_EXPR_LENGTH}`,
      0,
    )
  const toks = lex(src)
  let p = 0
  let depth = 0
  const nest = <T>(at: number, f: () => T): T => {
    if (++depth > MAX_DEPTH)
      throw new ExprError(`nests deeper than ${MAX_DEPTH} levels`, at)
    try {
      return f()
    } finally {
      depth--
    }
  }
  const peek = () => toks[p]!
  const isOp = (...ops: string[]) => peek().k === 'op' && ops.includes(peek().v)
  const expect = (op: string) => {
    if (!isOp(op)) throw new ExprError(`expected “${op}”`, peek().at)
    p++
  }

  const ternary = (): Node => nest(peek().at, ternaryAt)
  const ternaryAt = (): Node => {
    const c = or()
    if (!isOp('?')) return c
    p++
    const a = ternary()
    expect(':')
    return { t: 'if', c, a, b: ternary() }
  }
  const left = (next: () => Node, ops: string[]) => (): Node => {
    let a = next()
    while (isOp(...ops)) {
      const op = toks[p++]!.v
      a = { t: 'bin', op, a, b: next() }
    }
    return a
  }
  const unary = (): Node => {
    if (isOp('-', '!', '+')) {
      const tok = toks[p++]!
      return { t: 'un', op: tok.v, a: nest(tok.at, unary) }
    }
    return postfix()
  }
  const mul = left(unary, ['*', '/', '%'])
  const add = left(mul, ['+', '-'])
  const cmp = left(add, ['<', '<=', '>', '>=', '==', '!='])
  const and = left(cmp, ['&&'])
  const or = left(and, ['||'])

  const postfix = (): Node => {
    let n = primary()
    while (isOp('.')) {
      const dot = toks[p++]!
      const f = peek()
      if (n.t !== 'call' || (n.name !== 'prev' && n.name !== 'part'))
        throw new ExprError('only prev() and part() have fields', dot.at)
      const fields = n.name === 'part' ? PART_FIELDS : PREV_FIELDS
      if (f.k !== 'id' || !fields.includes(f.v as Field))
        throw new ExprError(
          `only ${fieldList(fields)} can follow ${n.name}()`,
          f.at,
        )
      p++
      n = { t: 'field', of: n, name: f.v as Field, at: dot.at }
    }
    return n
  }
  const primary = (): Node => {
    const tok = toks[p++]!
    if (tok.k === 'num') return { t: 'num', v: Number(tok.v) }
    if (tok.k === 'str') return { t: 'str', v: tok.v, at: tok.at }
    if (tok.k === 'id') {
      if (!isOp('(')) {
        if (!Object.hasOwn(VARIABLES, tok.v))
          throw new ExprError(
            `unknown name “${tok.v}”${didYouMean(tok.v, Object.keys(VARIABLES))} (try hour, day, or a function call)`,
            tok.at,
          )
        return { t: 'var', name: tok.v, at: tok.at }
      }
      p++
      const fn = Object.hasOwn(FUNCTIONS, tok.v) ? FUNCTIONS[tok.v] : undefined
      if (!fn)
        throw new ExprError(
          `unknown function “${tok.v}()”${didYouMean(tok.v, Object.keys(FUNCTIONS))}`,
          tok.at,
        )
      const args: Node[] = []
      if (!isOp(')')) {
        args.push(ternary())
        while (isOp(',')) {
          p++
          args.push(ternary())
        }
      }
      expect(')')
      const [lo, hi] = fn.args
      if (args.length < lo || args.length > hi)
        throw new ExprError(
          `${tok.v}() takes ${lo === hi ? lo : `${lo}–${hi}`} argument${hi === 1 ? '' : 's'}`,
          tok.at,
        )
      const named = ['knob', 'on', 'prev', 'part'].includes(tok.v)
      if (named !== (args[0]?.t === 'str'))
        throw new ExprError(
          named
            ? `${tok.v}() takes a quoted id, like ${tok.v}('x')`
            : `${tok.v}() takes numbers, not text`,
          tok.at,
        )
      if (args.slice(1).some((a) => a.t === 'str'))
        throw new ExprError(`${tok.v}() takes numbers, not text`, tok.at)
      if ((tok.v === 'prev' || tok.v === 'part') && !isOp('.'))
        throw new ExprError(
          `${tok.v}('id') needs a field: ${fieldList(tok.v === 'part' ? PART_FIELDS : PREV_FIELDS)}`,
          tok.at,
        )
      return { t: 'call', name: tok.v, args, at: tok.at }
    }
    if (tok.k === 'op' && tok.v === '(') {
      const n = ternary()
      expect(')')
      return n
    }
    throw new ExprError(
      tok.k === 'end' ? 'unexpected end' : `unexpected “${tok.v}”`,
      tok.at,
    )
  }

  const root = ternary()
  if (peek().k !== 'end')
    throw new ExprError(`unexpected “${peek().v}”`, peek().at)
  if (root.t === 'str')
    throw new ExprError('a signal is a number, not text', root.at)
  return root
}

function build(n: Node): Compiled {
  switch (n.t) {
    case 'num': {
      const v = n.v
      return () => v
    }
    case 'str':
      return () => NaN
    case 'var':
      if (n.name === 'hour') return (e) => e.hour
      if (n.name === 'day') return (e) => e.day
      return () => Math.PI
    case 'field': {
      const of = n.of as { name: string; args: Node[] }
      const id = (of.args[0] as { v: string }).v
      const f = n.name
      if (of.name === 'part') return (e) => e.part?.(id)[f] ?? NaN
      return (e) => e.prev(id)[f as Exclude<Field, 'demand'>]
    }
    case 'call': {
      if (n.name === 'knob' || n.name === 'on') {
        const id = (n.args[0] as { v: string }).v
        return n.name === 'knob' ? (e) => e.knob(id) : (e) => (e.on(id) ? 1 : 0)
      }
      const fn = FUNCTIONS[n.name]!.fn!
      const args = n.args.map(build)
      return (e) => fn(...args.map((a) => a(e)))
    }
    case 'un': {
      const a = build(n.a)
      if (n.op === '-') return (e) => -a(e)
      if (n.op === '!') return (e) => +!a(e)
      return a
    }
    case 'if': {
      const [c, a, b] = [build(n.c), build(n.a), build(n.b)]
      return (e) => (c(e) ? a(e) : b(e))
    }
    case 'bin': {
      const [a, b] = [build(n.a), build(n.b)]
      switch (n.op) {
        case '+':
          return (e) => a(e) + b(e)
        case '-':
          return (e) => a(e) - b(e)
        case '*':
          return (e) => a(e) * b(e)
        case '/':
          return (e) => a(e) / b(e)
        case '%':
          return (e) => a(e) % b(e)
        case '<':
          return (e) => +(a(e) < b(e))
        case '<=':
          return (e) => +(a(e) <= b(e))
        case '>':
          return (e) => +(a(e) > b(e))
        case '>=':
          return (e) => +(a(e) >= b(e))
        case '==':
          return (e) => +(a(e) === b(e))
        case '!=':
          return (e) => +(a(e) !== b(e))
        case '&&':
          return (e) => (a(e) ? b(e) : 0)
        default:
          return (e) => a(e) || b(e)
      }
    }
  }
}

function collect(n: Node, refs: Refs) {
  if (n.t === 'call') {
    const id = n.args[0]?.t === 'str' ? n.args[0].v : null
    if (id !== null && n.name === 'knob') refs.knobs.add(id)
    if (id !== null && n.name === 'on') refs.switches.add(id)
    if (id !== null && n.name === 'prev') refs.parts.add(id)
    if (id !== null && n.name === 'part') refs.reads.add(id)
    n.args.forEach((a) => collect(a, refs))
  } else if (n.t === 'field') collect(n.of, refs)
  else if (n.t === 'un') collect(n.a, refs)
  else if (n.t === 'bin') {
    collect(n.a, refs)
    collect(n.b, refs)
  } else if (n.t === 'if') {
    collect(n.c, refs)
    collect(n.a, refs)
    collect(n.b, refs)
  }
}

const cache = new Map<string, Compiled>()

/** parse once, then evaluate as a closure. Throws ExprError on a bad expression. */
export function compileExpr(src: string): Compiled {
  let fn = cache.get(src)
  if (!fn) {
    const built = build(parse(src))
    // a signal that comes out NaN or infinite would poison the whole network
    fn = (e) => {
      const v = built(e)
      return Number.isFinite(v) ? v : 0
    }
    cache.set(src, fn)
  }
  return fn
}

/** what an expression reads; throws ExprError if it doesn't parse */
export function exprRefs(src: string): Refs {
  const refs: Refs = {
    knobs: new Set(),
    switches: new Set(),
    parts: new Set(),
    reads: new Set(),
  }
  collect(parse(src), refs)
  return refs
}
