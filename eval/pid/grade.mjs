#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The P&ID eval's grader. One scoring function, two adapters:
 *
 *   mcp   the run folder holds scene.json, an Anigram scene
 *   bare  the run folder holds pid.svg and pid.json ({ items, lines })
 *
 * Each adapter turns its run into the same neutral plant graph (items with
 * a tag and a set of families; process, signal and measuring connections),
 * and the scenario's answer key (answers/<id>.json) is checked against that
 * graph by script. No model judges anything.
 *
 *   node eval/pid/grade.mjs <runDir> <scenarioId> [--mode mcp|bare]
 *
 * prints the score as JSON. `grade(runDir, id, { mode })` does the same for
 * a batch runner. See README.md for the answer-key format and the weights.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  classifyBare,
  classifyPart,
  isWellFormedTag,
  kindOf,
  normTag,
  PASSABLE,
  tagParts,
} from './classify.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = join(here, '../..')

export const WEIGHTS = {
  equipment: 0.2,
  valves: 0.15,
  instruments: 0.15,
  connections: 0.2,
  loops: 0.15,
  tags: 0.075,
  drawn: 0.075,
}

// ---------------------------------------------------------------- the graph

/**
 * The neutral plant graph both adapters produce:
 *   items  Map id → { id, tag, ntag, letters, number, families, kind, text, partId?, hidden? }
 *   edges  [{ a, b, kind: 'process' | 'signal' | 'measure' }]
 */
function makeGraph() {
  const items = new Map()
  const edges = []
  return {
    items,
    edges,
    add(item) {
      const { letters, number } = tagParts(item.tag)
      const families = item.families
      items.set(item.id, {
        ...item,
        ntag: normTag(item.tag),
        letters,
        number,
        kind: kindOf(families),
      })
    },
    link(a, b, kind) {
      if (a === b || !items.has(a) || !items.has(b)) return false
      edges.push({ a, b, kind })
      return true
    },
  }
}

function adjacency(g) {
  const adj = new Map([...g.items.keys()].map((k) => [k, []]))
  for (const e of g.edges) {
    adj.get(e.a).push({ to: e.b, kind: e.kind })
    adj.get(e.b).push({ to: e.a, kind: e.kind })
  }
  return adj
}

// ------------------------------------------------------------- the adapters

/** domains that are pipework on a P&ID; power, shafts and light are not */
const PIPE_DOMAINS = new Set(['water', 'heat', 'fuel', 'air', 'oil'])

/** an Anigram scene as a plant graph */
export async function fromScene(scene) {
  const g = makeGraph()
  const notes = []
  const parts = Array.isArray(scene.parts) ? scene.parts : []
  const links = Array.isArray(scene.links) ? scene.links : []
  const isSignal = (l) =>
    l.domain === 'data' || ['signal', 'data', 'pneumatic'].includes(l.line)
  const piped = new Set()
  for (const l of links)
    if (PIPE_DOMAINS.has(l.domain) || isSignal(l)) {
      piped.add(l.from)
      piped.add(l.to)
    }
  for (const p of parts) {
    if (!p || typeof p.id !== 'string') continue
    const families = classifyPart(p)
    g.add({
      id: p.id,
      partId: p.id,
      tag: p.tag ?? '',
      families,
      text: [p.class, p.kind, p.label].filter(Boolean).join(' / '),
      hidden: !piped.has(p.id),
    })
  }
  const inst = Array.isArray(scene.instruments) ? scene.instruments : []
  const instId = (tag) => `inst:${tag}`
  for (const x of inst) {
    if (!x || typeof x.tag !== 'string') continue
    g.add({
      id: instId(x.tag),
      tag: x.tag,
      families: ['instrument'],
      text: `instrument ${x.tag}`,
    })
  }
  for (const l of links) {
    if (!g.items.has(l.from) || !g.items.has(l.to)) continue
    if (isSignal(l)) g.link(l.from, l.to, 'signal')
    else if (PIPE_DOMAINS.has(l.domain)) g.link(l.from, l.to, 'process')
  }
  const resolve = (ref) =>
    g.items.has(instId(ref)) ? instId(ref) : g.items.has(ref) ? ref : undefined
  for (const x of inst) {
    if (!x || typeof x.tag !== 'string') continue
    const me = instId(x.tag)
    const m = resolve(x.measures)
    if (m) g.link(me, m, m.startsWith('inst:') ? 'signal' : 'measure')
    else if (x.measures)
      notes.push(`${x.tag} measures "${x.measures}", which is not on the sheet`)
    const d = x.drives ? resolve(x.drives) : undefined
    if (d) g.link(me, d, 'signal')
  }
  // a part only on the power side (a grid supply) is not on the P&ID: left out of scoring and behaviour
  for (const it of g.items.values())
    if (it.hidden && !g.edges.some((e) => e.a === it.id || e.b === it.id))
      it.kind = 'hidden'
  return { graph: g, notes }
}

/** a bare run's pid.json as a plant graph */
export function fromBare(doc) {
  const g = makeGraph()
  const notes = []
  const items = Array.isArray(doc?.items) ? doc.items : []
  const byKey = new Map()
  items.forEach((it, i) => {
    if (!it || typeof it !== 'object') return
    const tag = typeof it.tag === 'string' ? it.tag : ''
    let id = tag || (typeof it.label === 'string' && it.label) || `item-${i}`
    if (g.items.has(id)) id = `${id}#${i}`
    g.add({
      id,
      tag,
      families: classifyBare({ type: it.type, label: it.label, tag }),
      text: [it.type, it.label].filter(Boolean).join(' / '),
    })
    for (const k of [tag, normTag(tag), it.label, it.id])
      if (typeof k === 'string' && k && !byKey.has(k)) byKey.set(k, id)
  })
  const find = (ref) =>
    typeof ref === 'string'
      ? (byKey.get(ref) ?? byKey.get(normTag(ref)))
      : undefined
  let dangling = 0
  for (const l of Array.isArray(doc?.lines) ? doc.lines : []) {
    const a = find(l?.from)
    const b = find(l?.to)
    if (!a || !b) {
      dangling++
      continue
    }
    const kind =
      /signal|electric|pneumatic|data|instrument|capillary|software|control/i.test(
        String(l.kind ?? ''),
      )
        ? 'signal'
        : 'process'
    // a signal line from an instrument to the thing it sits on is its tapping
    const ia = g.items.get(a).kind === 'instrument'
    const ib = g.items.get(b).kind === 'instrument'
    g.link(a, b, kind === 'signal' && ia !== ib ? 'signal' : kind)
  }
  if (dangling)
    notes.push(`${dangling} line(s) name an item that is not in items`)
  return { graph: g, notes }
}

// ---------------------------------------------------------------- selectors

const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** whether actual ISA letters do what required letters ask: same first letter, the rest a sub-multiset */
export function lettersMatch(actual, required) {
  if (!actual || !required) return false
  if (actual[0] !== required[0]) return false
  const pool = [...actual.slice(1)]
  for (const ch of required.slice(1)) {
    const i = pool.indexOf(ch)
    if (i < 0) return false
    pool.splice(i, 1)
  }
  return true
}

const normNumber = (n) =>
  String(n ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z.]/g, '')
    .replace(/\.$/, '')

/**
 * How well an item matches a selector: 1 all of it, 0.5 everything but the
 * tag or number, 0 not at all.
 * A selector is { tag?: regex on the normalised tag, family?: one or several,
 * letters?: ISA letters (one or several), number?: loop number, variable?: first letter }
 */
export function matchQuality(it, sel) {
  if (!it || it.kind === 'hidden') return 0
  if (sel.family && !asList(sel.family).some((f) => it.families.includes(f))) {
    // the right tag on the wrong kind of thing still counts for something
    if (sel.tag && new RegExp(sel.tag).test(it.ntag) && !sel.strict) return 0.5
    return 0
  }
  if (sel.letters || sel.variable) {
    if (it.kind !== 'instrument') return 0
    if (sel.variable && !asList(sel.variable).includes(it.letters[0])) return 0
    if (
      sel.letters &&
      !asList(sel.letters).some((l) => lettersMatch(it.letters, l))
    )
      return 0
  }
  let q = 1
  if (sel.tag && !new RegExp(sel.tag).test(it.ntag)) q = 0.5
  if (sel.number && normNumber(it.number) !== normNumber(sel.number)) q = 0.5
  return q
}

const describe = (sel) =>
  sel.says ??
  [
    sel.tag && `tag /${sel.tag}/`,
    sel.family && asList(sel.family).join('|'),
    sel.letters && asList(sel.letters).join('|'),
    sel.variable && `${asList(sel.variable).join('|')}-instrument`,
    sel.number && `#${sel.number}`,
  ]
    .filter(Boolean)
    .join(' ')

function candidates(g, sel, min = 1) {
  return [...g.items.values()]
    .map((it) => ({ it, q: matchQuality(it, sel) }))
    .filter((c) => c.q >= min)
}

/**
 * whether an item sits on something matching `sel`: its tapping (for an
 * instrument) or itself, then up to `hops` process steps through valves and
 * fittings
 */
function near(g, adj, id, sels, hops = 2) {
  const list = asList(sels)
  const ok = (n) =>
    n !== id && list.some((s) => matchQuality(g.items.get(n), s) > 0)
  const start = g.items.get(id)
  let frontier =
    start.kind === 'instrument'
      ? adj
          .get(id)
          .filter((e) => g.items.get(e.to).kind !== 'instrument')
          .map((e) => e.to)
      : [id]
  const seen = new Set([id, ...frontier])
  // where an instrument taps in, or the item itself, is always walked from
  const roots = new Set(frontier)
  for (let d = 0; d <= hops && frontier.length; d++) {
    const next = []
    for (const n of frontier) {
      if (ok(n)) return true
      if (!roots.has(n) && !passable(g.items.get(n))) continue
      for (const e of adj.get(n))
        if (e.kind === 'process' && !seen.has(e.to)) {
          seen.add(e.to)
          next.push(e.to)
        }
    }
    frontier = next
  }
  return false
}

const passable = (it, extra = []) =>
  !!it &&
  (it.kind === 'valve' ||
    it.kind === 'fitting' ||
    it.kind === 'instrument' ||
    it.families.some((f) => PASSABLE.has(f) || extra.includes(f)))

// ---------------------------------------------------------------- the checks

function countReq(g, adj, req, what) {
  const min = req.min ?? 1
  let good = 0
  let half = 0
  for (const { it, q } of candidates(g, req, 0.5)) {
    const placed = !req.on || near(g, adj, it.id, req.on, req.hops ?? 2)
    if (q === 1 && placed) good++
    else half++
  }
  const score = Math.min(
    1,
    (good + 0.5 * Math.min(half, Math.max(0, min - good))) / min,
  )
  return {
    score,
    missing:
      score < 1
        ? `${what}: ${describe(req)}${req.on ? ` on ${asList(req.on).map(describe).join(' or ')}` : ''}${min > 1 ? ` ×${min}` : ''} (found ${good}${half ? ` + ${half} partly` : ''})`
        : null,
  }
}

/** a simple process path from `from` to `to` through valves and fittings, meeting `via` and avoiding `avoid` */
function pathExists(g, adj, spec, { strict = true } = {}) {
  const via = strict ? asList(spec.via) : []
  const avoid = strict ? asList(spec.avoid) : []
  const through = asList(spec.through)
  const hits = (n, s) => matchQuality(g.items.get(n), s) > 0
  const starts = asList(spec.from).flatMap((f) =>
    candidates(g, f, 0.5).map((c) => c.it.id),
  )
  const isEnd = (n) =>
    asList(spec.to).some((t) => matchQuality(g.items.get(n), t) > 0)
  const need = via.map((v) => v.count ?? 1)
  for (const s of starts) {
    const onPath = new Set([s])
    const dfs = (n, got, depth) => {
      if (depth > 16) return false
      for (const e of adj.get(n)) {
        if (e.kind !== 'process' || onPath.has(e.to)) continue
        const m = e.to
        if (isEnd(m) && m !== s && got.every((c, i) => c >= need[i]))
          return true
        const it = g.items.get(m)
        if (!passable(it, through)) continue
        if (avoid.some((a) => hits(m, a))) continue
        const got2 = got.map((c, i) => (hits(m, via[i]) ? c + 1 : c))
        onPath.add(m)
        if (dfs(m, got2, depth + 1)) return true
        onPath.delete(m)
      }
      return false
    }
    if (
      dfs(
        s,
        need.map(() => 0),
        0,
      )
    )
      return true
  }
  return false
}

function checkConnection(g, adj, c) {
  if (pathExists(g, adj, c)) return { score: 1, missing: null }
  const loose = pathExists(g, adj, c, { strict: false })
  const label =
    c.says ??
    `${asList(c.from).map(describe).join(' or ')} → ${asList(c.to).map(describe).join(' or ')}${c.via ? ` via ${asList(c.via).map(describe).join(', ')}` : ''}${c.avoid ? ` avoiding ${asList(c.avoid).map(describe).join(', ')}` : ''}`
  return {
    score: loose ? 0.5 : 0,
    missing: `connection: ${label}${loose ? ' (connected, but not by that route)' : ''}`,
  }
}

function checkForbidden(g, adj, f) {
  const bad = pathExists(g, adj, f)
  return {
    score: bad ? 0 : 1,
    missing: bad
      ? `forbidden: ${f.says ?? `${describe(f.from)} → ${describe(f.to)}`}`
      : null,
  }
}

/** instruments reachable from `id` along signal lines through other instruments */
function signalReach(g, adj, id, max = 4) {
  const out = new Map([[id, 0]])
  let frontier = [id]
  for (let d = 1; d <= max; d++) {
    const next = []
    for (const n of frontier)
      for (const e of adj.get(n)) {
        if (e.kind !== 'signal' || out.has(e.to)) continue
        out.set(e.to, d)
        if (g.items.get(e.to).kind === 'instrument') next.push(e.to)
      }
    frontier = next
  }
  return out
}

/**
 * a control loop: a controller with a signal path to a final element, and
 * the measurements it takes. Scored 0.3 for the controller, 0.4 for reaching
 * the final element, 0.3 for the sensors.
 */
function checkLoop(g, adj, loop) {
  let best = 0
  let why = 'no controller'
  for (const ctl of asList(loop.controller)) {
    for (const { it: c, q } of candidates(g, ctl, 0.5)) {
      let s = 0.3 * q
      const reach = signalReach(g, adj, c.id)
      const finals = [...reach.keys()].filter((n) => {
        const it = g.items.get(n)
        return (
          it.kind !== 'instrument' &&
          asList(loop.final).some((f) => matchQuality(it, f) > 0) &&
          (!loop.finalOn || near(g, adj, n, loop.finalOn, loop.finalHops ?? 2))
        )
      })
      const finalQ = Math.max(
        0,
        ...finals.map((n) =>
          Math.max(
            ...asList(loop.final).map((f) => matchQuality(g.items.get(n), f)),
          ),
        ),
      )
      s += 0.4 * finalQ
      let sensorsOk = 1
      for (const sens of asList(loop.sensor)) {
        const need = sens.min ?? 1
        const got = [...reach.keys()].filter((n) => {
          const it = g.items.get(n)
          if (it.kind !== 'instrument') return false
          if (
            matchQuality(it, { ...sens, min: undefined, on: undefined }) === 0
          )
            return false
          // it measures something: a line to a non-instrument that is not what the loop drives
          const taps = adj.get(n).some((e) => {
            const o = g.items.get(e.to)
            return o.kind !== 'instrument' && !finals.includes(e.to)
          })
          return taps && (!sens.on || near(g, adj, n, sens.on, sens.hops ?? 2))
        }).length
        sensorsOk = Math.min(sensorsOk, Math.min(1, got / need))
      }
      s += 0.3 * sensorsOk
      if (s > best) {
        best = s
        why = [
          finalQ < 1 && 'final element not reached',
          sensorsOk < 1 && 'measurement missing',
        ]
          .filter(Boolean)
          .join(', ')
      }
    }
  }
  return {
    score: best,
    missing:
      best < 0.999
        ? `loop: ${loop.says ?? describe(asList(loop.controller)[0])} (${why || 'partly'})`
        : null,
  }
}

function checkSignal(g, adj, s) {
  let best = 0
  for (const { it: a, q } of candidates(g, s.from, 0.5)) {
    const reach = signalReach(g, adj, a.id)
    for (const n of reach.keys()) {
      const q2 = matchQuality(g.items.get(n), s.to)
      if (n !== a.id && q2 > 0) best = Math.max(best, Math.min(q, q2))
    }
  }
  return {
    score: best,
    missing:
      best < 1
        ? `signal: ${s.says ?? `${describe(s.from)} → ${describe(s.to)}`}`
        : null,
  }
}

/** items that ought to carry a tag: equipment, instruments, actuated and relief valves */
const wantsTag = (it) =>
  it.kind === 'equipment' ||
  it.kind === 'instrument' ||
  (it.kind === 'valve' &&
    it.families.some((f) =>
      ['control', 'onoff', 'relief', 'regulator'].includes(f),
    ))

function checkTags(g) {
  const want = [...g.items.values()].filter(wantsTag)
  const missing = []
  if (!want.length) return { score: 0, missing: ['tags: nothing to tag'] }
  const good = want.filter((it) => it.tag && isWellFormedTag(it.tag))
  for (const it of want)
    if (!it.tag) missing.push(`tags: ${it.text || it.id} has no tag`)
    else if (!isWellFormedTag(it.tag))
      missing.push(`tags: "${it.tag}" is not an ISA / plant tag`)
  const tagged = [...g.items.values()].filter(
    (it) => it.tag && it.kind !== 'hidden',
  )
  const seen = new Map()
  for (const it of tagged) seen.set(it.ntag, (seen.get(it.ntag) ?? 0) + 1)
  const dupes = [...seen].filter(([, n]) => n > 1).map(([t]) => t)
  for (const d of dupes) missing.push(`tags: ${d} is used more than once`)
  const unique = tagged.length
    ? tagged.filter((it) => seen.get(it.ntag) === 1).length / tagged.length
    : 0
  return { score: 0.7 * (good.length / want.length) + 0.3 * unique, missing }
}

// ------------------------------------------------------------ drawn: the svg

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

/** every run of text an SVG draws */
export function svgTexts(svg) {
  const out = []
  for (const m of String(svg).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
    const inner = m[1]
    out.push(decode(inner.replace(/<[^>]+>/g, ' ')))
    for (const t of inner.matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g))
      out.push(decode(t[1].replace(/<[^>]+>/g, '')))
  }
  return out.map((t) => t.trim()).filter(Boolean)
}

/** whether a tag is on the drawing: whole, or as an ISA bubble's letters and number */
export function tagDrawn(tag, texts, tokens) {
  const n = normTag(tag)
  if (!n) return false
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^A-Z0-9.])${esc}($|[^A-Z0-9])`)
  if (
    texts.some(
      (t) =>
        re.test(normTag(t)) || re.test(t.toUpperCase().replace(/[-_ /]/g, '')),
    )
  )
    return true
  const { letters, number } = tagParts(tag)
  return !!(
    letters &&
    number &&
    tokens.has(letters) &&
    tokens.has(normNumber(number))
  )
}

function checkDrawn(g, svg, why) {
  if (!svg) return { score: 0, missing: [`drawn: ${why ?? 'no drawing'}`] }
  const texts = svgTexts(svg)
  const tokens = new Set(
    texts.flatMap((t) => t.split(/\s+/).map((w) => normTag(w))),
  )
  const tagged = [...g.items.values()].filter(
    (it) => it.tag && it.kind !== 'hidden',
  )
  if (!tagged.length)
    return { score: 0, missing: ['drawn: nothing tagged to look for'] }
  const missing = tagged
    .filter((it) => !tagDrawn(it.tag, texts, tokens))
    .map((it) => `drawn: ${it.tag} is not on the drawing`)
  return { score: (tagged.length - missing.length) / tagged.length, missing }
}

// ------------------------------------------------------------ behaviour

const hourOf = (row) => Math.round(row.hour) % 24

function hoursOf(claim, hours) {
  if (claim.at !== undefined) return hours.filter((h) => h === claim.at % 24)
  if (claim.from !== undefined || claim.to !== undefined) {
    const from = (claim.from ?? 0) % 24
    const to = (claim.to ?? 23) % 24
    return hours.filter((h) =>
      from <= to ? h >= from && h <= to : h >= from || h <= to,
    )
  }
  return hours
}

function aggregate(values, agg) {
  if (!values.length) return NaN
  if (agg === 'sum') return values.reduce((a, b) => a + b, 0)
  if (agg === 'max') return Math.max(...values)
  if (agg === 'min') return Math.min(...values)
  return NaN
}

function compare(a, op, b, tol = 0.05) {
  const eps = 1e-3
  switch (op) {
    case '>':
      return a > b + eps
    case '>=':
      return a >= b - eps
    case '<':
      return a < b - eps
    case '<=':
      return a <= b + eps
    case '==':
      return Math.abs(a - b) <= eps
    case '!=':
      return Math.abs(a - b) > eps
    case '~':
      return Math.abs(a - b) <= tol * Math.abs(b) + eps
    default:
      throw new Error(`unknown op ${op}`)
  }
}

/** the scene parts a behaviour selector picks, through the graph's classification */
function partsFor(g, sel) {
  return (
    [...g.items.values()]
      // a part only on the power side (a grid supply) is not on the P&ID, so no claim is about it
      .filter((it) => it.partId && matchQuality(it, sel) === 1)
      .map((it) => it.partId)
  )
}

function evalCond(g, rows, row, cond) {
  const ids = partsFor(g, cond.of)
  if (!ids.length)
    return { ok: false, why: `nothing matches ${describe(cond.of)}` }
  const read = (r, id, field) =>
    r.parts[id]?.[field] ?? (field === 'fill' ? NaN : 0)
  let rhs = cond.value
  if (cond.ref) {
    const rr =
      cond.ref.at !== undefined
        ? rows.find((r) => hourOf(r) === cond.ref.at % 24)
        : row
    const rids = cond.ref.of ? partsFor(g, cond.ref.of) : ids
    if (!rr || !rids.length)
      return {
        ok: false,
        why: `nothing matches ${describe(cond.ref.of ?? cond.of)}`,
      }
    const vals = rids.map((id) => read(rr, id, cond.ref.field ?? cond.field))
    rhs =
      (cond.ref.agg && cond.ref.agg !== 'any'
        ? aggregate(vals, cond.ref.agg)
        : aggregate(vals, 'sum')) * (cond.ref.times ?? 1)
  }
  const vals = ids.map((id) => read(row, id, cond.field))
  const agg = cond.agg ?? 'any'
  if (agg === 'any')
    return { ok: vals.some((v) => compare(v, cond.op, rhs, cond.tol)) }
  if (agg === 'all')
    return { ok: vals.every((v) => compare(v, cond.op, rhs, cond.tol)) }
  return { ok: compare(aggregate(vals, agg), cond.op, rhs, cond.tol) }
}

async function checkBehaviour(g, scene, claims) {
  const { validateScene } = await import(
    pathToFileURL(join(repo, 'src/format/validate.ts')).href
  )
  const { simulateDay } = await import(
    pathToFileURL(join(repo, 'src/format/report.ts')).href
  )
  const v = validateScene(scene)
  if (!v.ok || !v.scene)
    return {
      score: 0,
      missing: [
        `behaviour: the scene does not validate (${(v.errors ?? []).slice(0, 3).join('; ')})`,
      ],
    }
  let report
  try {
    report = simulateDay(v.scene)
  } catch (e) {
    return {
      score: 0,
      missing: [`behaviour: the simulation failed (${e.message})`],
    }
  }
  const rows = report.rows.slice(1)
  const hours = [...new Set(rows.map(hourOf))]
  const missing = []
  let held = 0
  for (const c of claims) {
    const hs = hoursOf(c, hours)
    const results = hs.map((h) => {
      const row = rows.find((r) => hourOf(r) === h)
      const rs = asList(c.all).map((cond) => evalCond(g, rows, row, cond))
      return { h, ok: rs.every((r) => r.ok), why: rs.find((r) => r.why)?.why }
    })
    const ok =
      hs.length > 0 &&
      (c.sometime ? results.some((r) => r.ok) : results.every((r) => r.ok))
    if (ok) held++
    else {
      const why = results.find((r) => r.why)?.why
      const bad = results.filter((r) => !r.ok).map((r) => r.h)
      missing.push(
        `behaviour: ${c.says}${why ? ` (${why})` : c.sometime ? ' (never)' : ` (fails at ${bad.slice(0, 6).join(', ')}h)`}`,
      )
    }
  }
  return { score: held / claims.length, missing }
}

// ------------------------------------------------------------ rendering

/** the sheet as SVG, drawn by the built Anigram MCP server, or why it could not be */
async function renderScene(runDir) {
  const server = join(repo, 'mcp/dist/anigram-mcp.mjs')
  if (!existsSync(server))
    return { why: 'the MCP server is not built (npm run build:mcp)' }
  let Client, StdioClientTransport
  try {
    ;({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'))
    ;({ StdioClientTransport } =
      await import('@modelcontextprotocol/sdk/client/stdio.js'))
  } catch {
    return { why: 'the MCP SDK is not installed (npm install)' }
  }
  const client = new Client({ name: 'anigram-pid-grade', version: '0' })
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [server],
        cwd: runDir,
        stderr: 'ignore',
      }),
    )
    const r = await client.callTool({
      name: 'render_scene',
      arguments: { file: 'scene.json', format: 'svg', labels: false },
    })
    const text = (r.content ?? []).find(
      (c) => c.type === 'text' && c.text.includes('<svg'),
    )?.text
    if (r.isError || !text)
      return {
        why: `render_scene refused it: ${(r.content ?? [])
          .map((c) => c.text ?? '')
          .join(' ')
          .slice(0, 300)}`,
      }
    return { svg: text }
  } catch (e) {
    return { why: `render_scene failed: ${e.message}` }
  } finally {
    await client.close().catch(() => {})
  }
}

// ------------------------------------------------------------ the grade

const readJson = (file) => {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return {
      error: existsSync(file) ? `does not parse: ${e.message}` : 'missing',
    }
  }
}

export function loadAnswer(id) {
  const file = join(here, 'answers', `${id}.json`)
  if (!existsSync(file)) throw new Error(`no answer key for scenario "${id}"`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** score a run's graph against an answer key; svg is the drawing's markup, if any */
export async function scoreGraph(
  graph,
  answer,
  { svg, svgWhy, scene, mode } = {},
) {
  const adj = adjacency(graph)
  const scores = {}
  const missing = {}
  const tally = (key, results) => {
    if (!results.length) return
    scores[key] = results.reduce((a, r) => a + r.score, 0) / results.length
    missing[key] = results.map((r) => r.missing).filter(Boolean)
  }
  tally(
    'equipment',
    asList(answer.equipment).map((r) => countReq(graph, adj, r, 'equipment')),
  )
  tally(
    'valves',
    asList(answer.valves).map((r) => countReq(graph, adj, r, 'valve')),
  )
  tally(
    'instruments',
    asList(answer.instruments).map((r) =>
      countReq(graph, adj, { ...r, family: 'instrument' }, 'instrument'),
    ),
  )
  tally('connections', [
    ...asList(answer.connections).map((c) => checkConnection(graph, adj, c)),
    ...asList(answer.forbidden).map((f) => checkForbidden(graph, adj, f)),
  ])
  tally('loops', [
    ...asList(answer.loops).map((l) => checkLoop(graph, adj, l)),
    ...asList(answer.signals).map((s) => checkSignal(graph, adj, s)),
  ])
  const t = checkTags(graph)
  scores.tags = t.score
  missing.tags = t.missing
  const d = checkDrawn(graph, svg, svgWhy)
  scores.drawn = d.score
  missing.drawn = d.missing
  let wsum = 0
  let total = 0
  for (const [k, w] of Object.entries(WEIGHTS))
    if (scores[k] !== undefined) {
      wsum += w
      total += w * scores[k]
    }
  const claims = asList(answer.behaviour)
  let behaviour = null
  if (claims.length) {
    if (mode === 'mcp' && scene) {
      const b = await checkBehaviour(graph, scene, claims)
      behaviour = b.score
      missing.behaviour = b.missing
    } else {
      behaviour = 0
      missing.behaviour = [
        'behaviour: a bare drawing cannot be simulated, so no claim can be verified',
      ]
    }
  }
  return { static: wsum ? total / wsum : 0, behaviour, scores, missing }
}

/** grade one run folder against one scenario */
export async function grade(runDir, scenarioId, { mode } = {}) {
  const answer = loadAnswer(scenarioId)
  const m = mode ?? (existsSync(join(runDir, 'scene.json')) ? 'mcp' : 'bare')
  const notes = []
  let graph
  let delivered = 0
  let svg
  let svgWhy
  let scene
  if (m === 'mcp') {
    const s = readJson(join(runDir, 'scene.json'))
    if (s.value && Array.isArray(s.value.parts)) {
      delivered = 1
      scene = s.value
      if (scene.drawing !== 'pid')
        notes.push(
          `the scene's drawing is "${scene.drawing ?? 'pictorial'}", not "pid"`,
        )
      const r = await fromScene(scene)
      graph = r.graph
      notes.push(...r.notes)
      if (scene.drawing === 'pid')
        ({ svg, why: svgWhy } = await renderScene(runDir))
      else svgWhy = 'the scene is not drawn as a P&ID'
    } else notes.push(`scene.json ${s.error ?? 'has no parts'}`)
  } else if (m === 'bare') {
    const j = readJson(join(runDir, 'pid.json'))
    const svgFile = join(runDir, 'pid.svg')
    const svgText = existsSync(svgFile) ? readFileSync(svgFile, 'utf8') : ''
    const svgOk = /<svg[\s>]/.test(svgText)
    if (j.value && Array.isArray(j.value.items)) {
      delivered += 0.5
      const r = fromBare(j.value)
      graph = r.graph
      notes.push(...r.notes)
    } else notes.push(`pid.json ${j.error ?? 'has no items'}`)
    if (svgOk) {
      delivered += 0.5
      svg = svgText
    } else
      svgWhy = existsSync(svgFile)
        ? 'pid.svg is not an SVG'
        : 'pid.svg is missing'
  } else throw new Error(`mode is mcp or bare, not ${m}`)

  if (!graph) {
    const claims = asList(answer.behaviour)
    return {
      scenario: scenarioId,
      mode: m,
      delivered,
      static: 0,
      behaviour: claims.length ? 0 : null,
      scores: {},
      missing: {},
      notes,
    }
  }
  const r = await scoreGraph(graph, answer, { svg, svgWhy, scene, mode: m })
  return {
    scenario: scenarioId,
    mode: m,
    delivered,
    static: round(r.static),
    behaviour: r.behaviour === null ? null : round(r.behaviour),
    scores: Object.fromEntries(
      Object.entries(r.scores).map(([k, v]) => [k, round(v)]),
    ),
    missing: r.missing,
    notes,
    items: graph.items.size,
  }
}

const round = (v) => Math.round(v * 1000) / 1000

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { mode: { type: 'string' } },
  })
  const [runDir, id] = positionals
  if (!runDir || !id) {
    console.error(
      'usage: node eval/pid/grade.mjs <runDir> <scenarioId> [--mode mcp|bare]',
    )
    process.exit(2)
  }
  const out = await grade(runDir, id, { mode: values.mode })
  console.log(JSON.stringify(out, null, 2))
}
