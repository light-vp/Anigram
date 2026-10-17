#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Derive the dataset scenarios' answer keys from the DEXPI files themselves.
 *
 *   node eval/pid/derive-dexpi.mjs          # rewrites answers/<id>.json for every dataset scenario
 *   node eval/pid/derive-dexpi.mjs --print  # prints them instead
 *
 * Deliberately independent of Anigram: a few dozen lines of regex XML
 * parsing and Node built-ins, never src/format/dexpiImport.ts, so the ground
 * truth is not Anigram's own reading of the file. What it reads:
 *
 *   Equipment            top-level items with their tag; nozzles map to them
 *   PipingNetworkSystem  each segment's Connection and the components in it,
 *                        chained in document order, as a process graph
 *   ActuatingSystem      which valve each actuating function moves
 *   ProcessInstrumentationFunction
 *                        category + functions as ISA letters, the number,
 *                        where its sensor sits, and the signal lines between
 *                        functions and to actuators
 *
 * From those it writes equipment, valve counts by family, instruments,
 * equipment-to-equipment connections (with the check, actuated and relief
 * valves on each route), control loops and instrument-to-instrument signals.
 * Scenarios that modify a file add their extra requirements (MODS below) on
 * top of the derived key.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = join(here, '../..')

// ------------------------------------------------------------ a tiny XML reader

export function parseXml(src) {
  const root = { name: '#root', attrs: {}, kids: [], parent: null }
  const stack = [root]
  const re =
    /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g
  const ent = (s) =>
    s
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
        String.fromCodePoint(parseInt(n, 16)),
      )
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  let m
  while ((m = re.exec(src))) {
    if (!m[2]) continue
    if (m[1]) {
      stack.pop()
      continue
    }
    const attrs = {}
    for (const a of m[3].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs[a[1]] = ent(a[2] ?? a[3])
    const n = { name: m[2], attrs, kids: [], parent: stack.at(-1) }
    stack.at(-1).kids.push(n)
    if (!m[4]) stack.push(n)
  }
  return root
}

const walk = (n, f) => {
  f(n)
  for (const k of n.kids) walk(k, f)
}
const kids = (n, name) => n.kids.filter((k) => k.name === name)
/** a node's own DEXPI attributes (GenericAttribute Name → Value), not its children's */
function attrsOf(n) {
  const out = {}
  for (const ga of kids(n, 'GenericAttributes'))
    for (const a of kids(ga, 'GenericAttribute'))
      if (a.attrs.Value !== undefined && out[a.attrs.Name] === undefined)
        out[a.attrs.Name] = a.attrs.Value
  return out
}
const assoc = (n, type) =>
  kids(n, 'Association')
    .filter((a) => a.attrs.Type === type)
    .map((a) => a.attrs.ItemID)

// ------------------------------------------------------------ what a DEXPI file holds

const equipmentFamily = (cls) =>
  /Pump/.test(cls)
    ? ['pump']
    : /Compressor|Blower/.test(cls)
      ? ['compressor']
      : /HeatExchanger|Cooler|Heater|Condenser|Reboiler/.test(cls)
        ? ['heat-exchanger']
        : /Column/.test(cls)
          ? ['column', 'vessel']
          : /Tank|Silo/.test(cls)
            ? ['tank', 'vessel', 'container']
            : /Vessel|Drum|Separator/.test(cls)
              ? ['vessel', 'container']
              : /Filter|Strainer/.test(cls)
                ? ['filter']
                : /Reactor/.test(cls)
                  ? ['reactor', 'vessel']
                  : /Mixer|Agitator/.test(cls)
                    ? ['mixer', 'agitator']
                    : ['other']

const valveFamily = (cls) =>
  /Check/.test(cls)
    ? 'check'
    : /Safety|Relief|RuptureDisc|Breather/.test(cls)
      ? 'relief'
      : /Valve/.test(cls)
        ? 'isolation'
        : undefined

/** letters only: ⁺ (high), parentheses and the like dropped */
const isaLetters = (s) => String(s ?? '').replace(/[^A-Z]/g, '')
const isaNumber = (s) =>
  String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/\.$/, '')
/** a regex for a tag in the grader's normalised form (no dashes or spaces) */
const tagRe = (t) =>
  `^${t
    .toUpperCase()
    .replace(/[\s\-_/]+/g, '')
    .replace(/\./g, '\\.')}$`

export function readDexpi(xml) {
  const root = parseXml(xml)
  const byId = new Map()
  walk(root, (n) => n.attrs.ID && byId.set(n.attrs.ID, n))
  const model = kids(root, 'PlantModel')[0]

  // equipment, and which equipment each nozzle belongs to
  const equipment = []
  const owner = new Map()
  for (const e of kids(model, 'Equipment')) {
    const a = attrsOf(e)
    const tag =
      a.TagNameAssignmentClass ??
      (a.TagNamePrefixAssignmentClass
        ? `${a.TagNamePrefixAssignmentClass}-${a.TagNameSequenceNumberAssignmentClass ?? ''}`
        : undefined)
    let nozzles = 0
    walk(e, (n) => {
      if (n.name === 'Nozzle') {
        owner.set(n.attrs.ID, e.attrs.ID)
        nozzles++
      }
    })
    equipment.push({
      id: e.attrs.ID,
      cls: e.attrs.ComponentClass,
      tag,
      nozzles,
    })
  }

  // actuated valves: ActuatingSystem → OperatedValveReference → the valve
  const actuatedBy = new Map() // valve id → actuating system id
  const systemNumber = new Map()
  for (const s of kids(model, 'ActuatingSystem')) {
    systemNumber.set(
      s.attrs.ID,
      attrsOf(s).ActuatingSystemNumberAssignmentClass,
    )
    for (const c of kids(s, 'ActuatingSystemComponent'))
      for (const v of assoc(c, 'refers to')) actuatedBy.set(v, s.attrs.ID)
  }

  // piping: components, and the process edges between them
  const comps = new Map() // id → { id, cls, tag?, what }
  const edges = []
  const segOf = new Map() // component id → segment id
  const segComps = new Map()
  let open = 0
  for (const sys of kids(model, 'PipingNetworkSystem'))
    for (const seg of kids(sys, 'PipingNetworkSegment')) {
      const inner = seg.kids.filter(
        (k) =>
          k.name === 'PipingComponent' || k.name === 'PipeOffPageConnector',
      )
      for (const c of inner) {
        const a = attrsOf(c)
        comps.set(c.attrs.ID, {
          id: c.attrs.ID,
          cls: c.attrs.ComponentClass,
          tag:
            a.PipingComponentNumberAssignmentClass &&
            /[A-Z]{2}/.test(a.PipingComponentNumberAssignmentClass)
              ? a.PipingComponentNumberAssignmentClass
              : a.PositionNumberAssignmentClass,
          what: c.name === 'PipeOffPageConnector' ? 'offpage' : 'piping',
        })
        segOf.set(c.attrs.ID, seg.attrs.ID)
      }
      segComps.set(
        seg.attrs.ID,
        inner.map((c) => c.attrs.ID),
      )
      const conn = kids(seg, 'Connection')[0]?.attrs ?? {}
      const chain = []
      const push = (id) => id && chain.at(-1) !== id && chain.push(id)
      push(conn.FromID)
      for (const c of inner)
        if (c.attrs.ID !== conn.FromID && c.attrs.ID !== conn.ToID)
          push(c.attrs.ID)
      push(conn.ToID)
      // an open end: the line runs on off the sheet
      if (!conn.FromID) chain.unshift(`open-${++open}`)
      if (!conn.ToID) chain.push(`open-${++open}`)
      for (let i = 1; i < chain.length; i++)
        edges.push([chain[i - 1], chain[i]])
    }
  const node = (id) => (owner.has(id) ? owner.get(id) : id)
  const g = new Map()
  for (const [a0, b0] of edges) {
    const a = node(a0)
    const b = node(b0)
    if (a === b) continue
    if (!g.has(a)) g.set(a, new Set())
    if (!g.has(b)) g.set(b, new Set())
    g.get(a).add(b)
    g.get(b).add(a)
  }

  // instrumentation functions
  const pifs = []
  walk(model, (n) => {
    if (n.name !== 'ProcessInstrumentationFunction' || !n.attrs.ID) return
    const a = attrsOf(n)
    if (!a.ProcessInstrumentationFunctionCategoryAssignmentClass) return
    const psgf = []
    walk(n, (k) => {
      if (k.name === 'ProcessSignalGeneratingFunction')
        psgf.push(...assoc(k, 'is located in'))
    })
    const actuating = []
    walk(n, (k) => {
      if (k.name === 'ActuatingFunction')
        actuating.push(...assoc(k, 'is fulfilled by'))
    })
    pifs.push({
      id: n.attrs.ID,
      letters:
        isaLetters(a.ProcessInstrumentationFunctionCategoryAssignmentClass) +
        isaLetters(a.ProcessInstrumentationFunctionsAssignmentClass),
      functions: isaLetters(a.ProcessInstrumentationFunctionsAssignmentClass),
      number: isaNumber(a.ProcessInstrumentationFunctionNumberAssignmentClass),
      sensorAt: psgf,
      actuating,
    })
  })
  // signal lines between functions: every InformationFlow other than a measuring line
  const signals = []
  walk(model, (n) => {
    if (
      n.name !== 'InformationFlow' ||
      n.attrs.ComponentClass === 'MeasuringLineFunction'
    )
      return
    const s = assoc(n, 'has logical start')[0]
    const e = assoc(n, 'has logical end')[0]
    if (s && e) signals.push([s, e])
  })
  return {
    equipment,
    comps,
    actuatedBy,
    systemNumber,
    g,
    pifs,
    signals,
    byId,
    segOf,
    segComps,
    owner,
  }
}

// ------------------------------------------------------------ the answer key

export function deriveAnswer(xml) {
  const d = readDexpi(xml)
  const answer = {
    equipment: [],
    valves: [],
    instruments: [],
    connections: [],
    loops: [],
    signals: [],
  }
  const eqSel = new Map()
  for (const e of d.equipment) {
    if (!e.nozzles) continue // a column section or the like: part of the item it sits in
    const sel = {
      family: equipmentFamily(e.cls),
      ...(e.tag ? { tag: tagRe(e.tag) } : {}),
      says: `${e.tag ?? e.id} (${e.cls})`,
    }
    eqSel.set(e.id, sel)
    answer.equipment.push(sel)
  }

  // the function that moves each actuated valve, and whether it controls or only switches
  const pifById = new Map(d.pifs.map((p) => [p.id, p]))
  const pifOfSystem = new Map()
  for (const p of d.pifs) for (const s of p.actuating) pifOfSystem.set(s, p)
  const upstream = new Map() // function id → functions signalling into it
  for (const [s, e] of d.signals) {
    const sp = pifById.has(s) ? s : undefined
    const ep = pifById.has(e)
      ? e
      : [...pifById.values()].find((p) => {
          const n = d.byId.get(e)
          return n && p.id === ancestorPif(n)?.attrs.ID
        })?.id
    if (sp && ep && sp !== ep) {
      if (!upstream.has(ep)) upstream.set(ep, new Set())
      upstream.get(ep).add(sp)
    }
  }
  function ancestorPif(n) {
    for (let p = n; p; p = p.parent)
      if (p.name === 'ProcessInstrumentationFunction') return p
    return undefined
  }
  const chainOf = (pid) => {
    const seen = new Set([pid])
    const out = [pifById.get(pid)]
    const q = [pid]
    while (q.length)
      for (const u of upstream.get(q.shift()) ?? [])
        if (!seen.has(u)) {
          seen.add(u)
          out.push(pifById.get(u))
          q.push(u)
        }
    return out
  }
  const actuatedValve = new Map() // valve id → { family, tag, loop }
  for (const [valve, sys] of d.actuatedBy) {
    const p = pifOfSystem.get(sys)
    const chain = p ? chainOf(p.id) : []
    const controls = chain.some((x) => x.functions.includes('C'))
    actuatedValve.set(valve, {
      family: controls ? ['control'] : ['onoff', 'control'],
      tag: d.systemNumber.get(sys) ?? d.comps.get(valve)?.tag,
      pif: p,
      chain,
    })
  }

  // valves by family
  const counts = { isolation: 0, check: 0, relief: 0 }
  for (const c of d.comps.values()) {
    if (c.what !== 'piping') continue
    if (actuatedValve.has(c.id)) {
      const v = actuatedValve.get(c.id)
      answer.valves.push({
        family: v.family,
        ...(v.tag ? { tag: tagRe(v.tag) } : {}),
        says: `${v.tag ?? c.id} (actuated ${c.cls})`,
      })
      continue
    }
    const f = valveFamily(c.cls)
    if (f) counts[f]++
    if (f === 'relief' && c.tag)
      answer.valves.push({
        family: 'relief',
        tag: tagRe(c.tag),
        says: `${c.tag} (${c.cls})`,
      })
  }
  for (const [f, n] of Object.entries(counts))
    if (
      n &&
      !(f === 'relief' && answer.valves.some((v) => v.family === 'relief'))
    )
      answer.valves.push({ family: f, min: n })

  // what an item is, for a selector
  const selOf = (id) => {
    if (eqSel.has(id)) return { ...eqSel.get(id) }
    if (actuatedValve.has(id)) {
      const v = actuatedValve.get(id)
      return { family: v.family, ...(v.tag ? { tag: tagRe(v.tag) } : {}) }
    }
    return undefined
  }

  // instruments; a flow element sits in the pipe as a piping component
  for (const c of d.comps.values())
    if (/FlowMeasuringElement/.test(c.cls)) {
      const number = String(c.tag ?? '').replace(/^[A-Z\s-]+/, '')
      answer.instruments.push({
        letters: ['FE', 'FT', 'FIT'],
        ...(number ? { number } : {}),
        says: `${c.tag ?? 'flow element'} (${c.cls})`,
      })
    }
  for (const p of d.pifs) {
    const req = {
      letters: p.letters,
      ...(p.number ? { number: p.number } : {}),
      says: `${p.letters} ${p.number}`.trim(),
    }
    const on = p.sensorAt
      .map((loc) => (d.owner.has(loc) ? selOf(d.owner.get(loc)) : selOf(loc)))
      .filter(Boolean)
    // a sensor in a segment that also holds an actuated valve sits on that valve's line
    for (const loc of p.sensorAt)
      for (const c of d.segComps.get(loc) ?? [])
        if (actuatedValve.has(c)) on.push(selOf(c))
    if (on.length) {
      req.on = on
      req.hops = 2
    }
    answer.instruments.push(req)
  }

  // loops: each actuated valve, its controller(s) and the measurements behind it
  for (const [valve, v] of actuatedValve) {
    if (!v.pif) continue
    const withC = v.chain.filter((x) => x.functions.includes('C'))
    const ctl = (withC.length ? withC : v.chain).map((x) => ({
      letters: x.letters,
      ...(x.number ? { number: x.number } : {}),
    }))
    const sensors = v.chain.filter((x) => x.sensorAt.length)
    const byVar = new Map()
    for (const s of sensors)
      byVar.set(s.letters[0], (byVar.get(s.letters[0]) ?? 0) + 1)
    const loop = {
      says: `${v.chain.map((x) => `${x.letters} ${x.number}`.trim()).join(' / ')} → ${v.tag ?? valve}`,
      controller: ctl,
      final: selOf(valve),
    }
    if (byVar.size)
      loop.sensor = [...byVar].map(([variable, min]) => ({ variable, min }))
    const tank = sensors
      .flatMap((s) => s.sensorAt)
      .map((loc) => d.owner.get(loc))
      .find((e) => eqSel.has(e))
    if (tank && loop.sensor) loop.sensor[0].on = selOf(tank)
    answer.loops.push(loop)
  }

  // signals between instrumentation functions
  const seenSig = new Set()
  for (const [s, e] of d.signals) {
    const a = pifById.get(s)
    const bNode = d.byId.get(e)
    const b =
      pifById.get(e) ??
      (bNode ? pifById.get(ancestorPif(bNode)?.attrs.ID) : undefined)
    if (!a || !b || a === b) continue
    const key = `${a.id}>${b.id}`
    if (seenSig.has(key)) continue
    seenSig.add(key)
    answer.signals.push({
      from: { letters: a.letters, ...(a.number ? { number: a.number } : {}) },
      to: { letters: b.letters, ...(b.number ? { number: b.number } : {}) },
      says: `${a.letters} ${a.number} → ${b.letters} ${b.number}`,
    })
  }

  // connections: from each equipment item (or off-page connector) through piping to the next
  const terminal = (id) => eqSel.has(id) || d.comps.get(id)?.what === 'offpage'
  const termSel = (id) =>
    eqSel.has(id)
      ? { ...eqSel.get(id) }
      : { family: 'offpage', says: 'an off-page connector' }
  const seenConn = new Set()
  // a relief valve joins everything on its inlet header to what it relieves
  // into; only the route between the two items nearest it is a requirement
  const nearestTo = new Map()
  for (const c of d.comps.values()) {
    if (valveFamily(c.cls) !== 'relief') continue
    const dist = new Map([[c.id, 0]])
    const q = [c.id]
    const found = []
    while (q.length) {
      const n = q.shift()
      for (const m of d.g.get(n) ?? []) {
        if (dist.has(m)) continue
        dist.set(m, dist.get(n) + 1)
        if (terminal(m)) found.push([m, dist.get(m)])
        else q.push(m)
      }
    }
    found.sort((a, b) => a[1] - b[1])
    const cut = found[1]?.[1] ?? Infinity
    nearestTo.set(
      c.id,
      new Set(found.filter(([, k]) => k <= cut).map(([m]) => m)),
    )
  }
  for (const start of d.g.keys()) {
    if (!terminal(start)) continue
    const dfs = (n, path) => {
      for (const m of d.g.get(n) ?? []) {
        if (path.includes(m)) continue
        if (terminal(m)) {
          if (m === start) continue
          const via = path
            .slice(1)
            .filter(
              (x) =>
                actuatedValve.has(x) ||
                ['check', 'relief'].includes(
                  valveFamily(d.comps.get(x)?.cls ?? ''),
                ),
            )
          const reliefs = path.filter((x) => nearestTo.has(x))
          if (
            reliefs.some(
              (r) => !nearestTo.get(r).has(start) || !nearestTo.get(r).has(m),
            )
          )
            continue
          const key = [
            [start, m].sort().join('~'),
            via.slice().sort().join(','),
          ].join('|')
          if (seenConn.has(key)) continue
          seenConn.add(key)
          // two off-page ends are not an equipment connection
          if (!eqSel.has(start) && !eqSel.has(m)) continue
          const c = { from: termSel(start), to: termSel(m) }
          if (via.length)
            c.via = via.map((x) =>
              actuatedValve.has(x)
                ? selOf(x)
                : { family: valveFamily(d.comps.get(x).cls) },
            )
          c.says = `${c.from.says ?? 'off-page'} → ${c.to.says ?? 'off-page'}${via.length ? ` via ${via.map((x) => actuatedValve.get(x)?.tag ?? d.comps.get(x).cls).join(', ')}` : ''}`
          for (const k of ['from', 'to']) delete c[k].says
          answer.connections.push(c)
          continue
        }
        if (String(m).startsWith('open-')) continue
        dfs(m, [...path, m])
      }
    }
    dfs(start, [start])
  }
  for (const k of Object.keys(answer))
    if (Array.isArray(answer[k]) && !answer[k].length) delete answer[k]
  return answer
}

// ------------------------------------------------------------ the dataset scenarios

const FILES = {
  c01: 'src/format/fixtures/dexpi-c01-reference.xml',
  c02: 'src/format/fixtures/dexpi-c02-column.xml',
  i05: 'src/format/fixtures/dexpi-i05-ratio-control.xml',
  c03: 'eval/pid/dataset/dexpi-c03-piping.xml',
  e06: 'eval/pid/dataset/dexpi-e06-pump-exchanger.xml',
  i04: 'eval/pid/dataset/dexpi-i04-measurement-control.xml',
  i06: 'eval/pid/dataset/dexpi-i06-flow-control.xml',
  i08: 'eval/pid/dataset/dexpi-i08-pressure-alarms.xml',
}

/** what a modification scenario adds on top of the file's own key */
const MODS = {
  'c01-bypass': {
    file: 'c01',
    valves: [
      {
        family: 'isolation',
        min: 9,
        says: 'the six isolating valves of the original plus two block valves and a bypass valve',
      },
    ],
    connections: [
      {
        says: 'H-1008 → T-4750 through PV-4712.02 between two block valves',
        from: { family: 'heat-exchanger', tag: '^H1008$' },
        to: { family: ['tank', 'vessel', 'container'], tag: '^T4750$' },
        via: [
          { family: ['control'], tag: '^PV4712\\.02$' },
          { family: 'isolation', count: 2 },
        ],
      },
      {
        says: 'a bypass from H-1008 to T-4750 that goes round PV-4712.02 through a valve',
        from: { family: 'heat-exchanger', tag: '^H1008$' },
        to: { family: ['tank', 'vessel', 'container'], tag: '^T4750$' },
        via: [{ family: ['isolation', 'control'] }],
        avoid: [{ tag: '^PV4712\\.02$' }],
      },
    ],
  },
  'c01-standby': {
    file: 'c01',
    retag: { '^P4712$': '^P4712A?$' },
    equipment: [
      { family: 'pump', tag: '^P4712B$', says: 'standby pump P-4712B' },
      { family: 'pump', min: 3 },
    ],
    valves: [{ family: 'check', min: 2 }],
    connections: [
      {
        says: 'T-4750 → P-4712B suction',
        from: { family: ['tank', 'vessel', 'container'], tag: '^T4750$' },
        to: { family: 'pump', tag: '^P4712B$' },
      },
      {
        says: 'P-4712B discharge → H-1008 through a check valve',
        from: { family: 'pump', tag: '^P4712B$' },
        to: { family: 'heat-exchanger', tag: '^H1008$' },
        via: [{ family: 'check' }],
      },
    ],
    behaviour: [
      {
        says: 'P-4712 runs as the duty pump for part of the day',
        sometime: true,
        all: [
          {
            of: { family: 'pump', tag: '^P4712A?$' },
            field: 'out',
            op: '>',
            value: 0,
          },
        ],
      },
      {
        says: 'after P-4712 trips, P-4712B carries the flow',
        sometime: true,
        all: [
          {
            of: { family: 'pump', tag: '^P4712A?$' },
            field: 'out',
            op: '==',
            value: 0,
          },
          {
            of: { family: 'pump', tag: '^P4712B$' },
            field: 'out',
            op: '>',
            value: 0,
          },
        ],
      },
      {
        says: 'product leaves the sheet every hour of the day',
        all: [{ of: { family: 'offpage' }, field: 'in', op: '>', value: 0 }],
      },
    ],
  },
  'c02-trip': {
    file: 'c02',
    equipment: [
      {
        family: 'offpage',
        min: 2,
        says: 'the new feed comes in from off the sheet',
      },
    ],
    valves: [
      {
        family: ['onoff', 'control'],
        tag: '^XV2750$',
        says: 'shutdown valve XV-2750 on the feed',
      },
    ],
    instruments: [
      {
        letters: ['LT', 'LIT', 'LI'],
        on: { family: ['column', 'vessel'] },
        hops: 2,
        says: 'a level transmitter on the column sump',
      },
      { letters: ['LAH', 'LIAH', 'LICAH'], says: 'a high level alarm' },
      {
        letters: ['LSHH', 'LZHH', 'LAHH', 'LZAHH', 'LSAHH'],
        says: 'a high-high level trip',
      },
    ],
    connections: [
      {
        says: 'feed from off the sheet → K-2750 through XV-2750',
        from: { family: 'offpage' },
        to: { family: ['column', 'vessel'], tag: '^K2750$' },
        via: [{ family: ['onoff', 'control'], tag: '^XV2750$' }],
      },
    ],
    loops: [
      {
        says: 'high-high sump level closes XV-2750',
        controller: [
          { letters: 'LS' },
          { letters: 'LZ' },
          { letters: 'LAHH' },
          { letters: 'US' },
          { letters: 'UZ' },
          { letters: 'LY' },
          { letters: 'UY' },
          { letters: 'XS' },
        ],
        final: { family: ['onoff', 'control'], tag: '^XV2750$' },
        sensor: [
          { variable: 'L', on: { family: ['column', 'vessel'] }, hops: 2 },
        ],
      },
    ],
  },
  'e06-modify': {
    file: 'e06',
    equipment: [
      {
        family: 'offpage',
        min: 3,
        says: 'suction in, product out and the cooling water in and out, off the sheet',
      },
    ],
    valves: [
      { family: 'check', min: 1 },
      { family: 'isolation', min: 2 },
      {
        family: 'control',
        tag: '^TV1009$',
        says: 'TV-1009 on the cooling water',
      },
    ],
    instruments: [
      { letters: ['TIC'], number: '1009' },
      { letters: ['TT', 'TIT', 'TE'], number: '1009' },
    ],
    connections: [
      {
        says: 'P-4713 → H-1009 through a check valve',
        from: { family: 'pump', tag: '^P4713$' },
        to: { family: 'heat-exchanger', tag: '^H1009$' },
        via: [{ family: 'check' }],
      },
      {
        says: 'H-1009 product out off the sheet',
        from: { family: 'heat-exchanger', tag: '^H1009$' },
        to: { family: 'offpage' },
      },
      {
        says: 'cooling water through H-1009 and TV-1009',
        from: { family: 'heat-exchanger', tag: '^H1009$' },
        to: { family: 'offpage' },
        via: [{ family: 'control', tag: '^TV1009$' }],
      },
    ],
    loops: [
      {
        says: 'TT-1009 → TIC-1009 → TV-1009',
        controller: { letters: 'TIC', number: '1009' },
        final: { family: 'control', tag: '^TV1009$' },
        sensor: [
          {
            variable: 'T',
            on: [
              { family: 'heat-exchanger', tag: '^H1009$' },
              { family: 'offpage' },
            ],
            hops: 2,
          },
        ],
      },
    ],
  },
}

/** dataset scenarios: id → the file their key comes from */
export const DATASET = {
  'c01-draw': 'c01',
  'c01-words': 'c01',
  'c02-draw': 'c02',
  'c02-words': 'c02',
  'i05-draw': 'i05',
  'i05-words': 'i05',
  'c03-draw': 'c03',
  'e06-draw': 'e06',
  'i04-draw': 'i04',
  'i06-draw': 'i06',
  'i08-draw': 'i08',
  ...Object.fromEntries(Object.entries(MODS).map(([id, m]) => [id, m.file])),
}

function retag(v, map) {
  if (Array.isArray(v)) return v.map((x) => retag(x, map))
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        k === 'tag' && map[x] ? map[x] : retag(x, map),
      ]),
    )
  return v
}

export function answerFor(id) {
  const key = DATASET[id]
  const base = deriveAnswer(readFileSync(join(repo, FILES[key]), 'utf8'))
  const mod = MODS[id]
  let answer = {
    id,
    source: `DEXPI e.V. TrainingTestCases, ${FILES[key].split('/').pop()} (CC BY 4.0)`,
    derived: 'derive-dexpi.mjs',
    ...base,
  }
  if (mod) {
    if (mod.retag) answer = retag(answer, mod.retag)
    for (const k of [
      'equipment',
      'valves',
      'instruments',
      'connections',
      'loops',
      'behaviour',
    ]) {
      if (!mod[k]) continue
      // a count the modification raises replaces the original's
      if (k === 'valves')
        answer.valves = (answer.valves ?? []).filter(
          (v) =>
            !(
              v.min &&
              mod.valves.some(
                (m) => m.min && String(m.family) === String(v.family),
              )
            ),
        )
      answer[k] = [...(answer[k] ?? []), ...mod[k]]
    }
    answer.modification = true
  }
  return answer
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const print = process.argv.includes('--print')
  for (const id of Object.keys(DATASET)) {
    const a = answerFor(id)
    const text = `${JSON.stringify(a, null, 2)}\n`
    if (print) console.log(text)
    else writeFileSync(join(here, 'answers', `${id}.json`), text)
  }
  if (!print) console.log(`wrote ${Object.keys(DATASET).length} answer keys`)
}
