// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { classOf, shownParts, shows } from '../packs/catalogue.ts'
import { splitTag } from '../sim/instruments.ts'
import type { InstrumentSpec, LinkSpec, PartSpec, Scene } from '../sim/types.ts'
import { cellToPx, linkPoints, sheetSize } from '../view/geometry.ts'
import type { Pt } from '../view/geometry.ts'
import { lineOf } from '../view/lines.ts'

/*
 * A P&ID as DEXPI: the Proteus XML that plant design software reads (DEXPI
 * 1.3, Proteus schema 4.1.1). Written from the published specification and
 * its example drawing; no DEXPI library code is used.
 *
 * What goes across is the plant, not the picture: each piece of equipment
 * with its tag and nozzles, each process line as a piping network system
 * whose segments run nozzle to nozzle with their valves in them, off-page
 * connectors, and the instrument loops (measuring, controlling, actuating).
 * Positions are given in millimetres on an A3 sheet so a viewer can place
 * things, but no shapes are sent: the receiving tool draws its own symbols.
 */

const RDL = 'http://sandbox.dexpi.org/rdl/'

/** Anigram's P&ID classes as DEXPI's: equipment, or a piping component set in a line */
const EQUIPMENT: Record<string, string> = {
  CentrifugalPump: 'CentrifugalPump',
  PositiveDisplacementPump: 'ReciprocatingPump',
  Compressor: 'CentrifugalCompressor',
  Fan: 'CentrifugalFan',
  Tank: 'Tank',
  Vessel: 'PressureVessel',
  HeatExchanger: 'HeatExchanger',
  Filter: 'Filter',
  ElectricMotor: 'AlternatingCurrentMotor',
  Turbine: 'SteamTurbine',
  RotaryPump: 'RotaryPump',
  Ejector: 'Ejector',
  StaticMixer: 'StaticMixer',
  OpenTank: 'Tank',
  HorizontalVessel: 'PressureVessel',
  SphericalTank: 'PressureVessel',
  Silo: 'Silo',
  // a stirred vessel: DEXPI draws its agitator as a part of the vessel
  Reactor: 'PressureVessel',
  ProcessColumn: 'ProcessColumn',
  PackedColumn: 'ProcessColumn',
  Cyclone: 'Separator',
  TubularHeatExchanger: 'TubularHeatExchanger',
  PlateHeatExchanger: 'PlateHeatExchanger',
  AirCoolingSystem: 'AirCoolingSystem',
  Furnace: 'Furnace',
  CoolingTower: 'CoolingTower',
}
const PIPING: Record<string, string> = {
  GateValve: 'GateValve',
  GlobeValve: 'GlobeValve',
  BallValve: 'BallValve',
  CheckValve: 'CheckValve',
  ButterflyValve: 'ButterflyValve',
  SafetyValve: 'SpringLoadedGlobeSafetyValve',
  // a control valve is a globe valve whose actuator is in an actuating system
  ControlValve: 'GlobeValve',
  Junction: 'PipeTee',
  PlugValve: 'PlugValve',
  NeedleValve: 'NeedleValve',
  DiaphragmValve: 'DiaphragmValve',
  AngleValve: 'AngleGlobeValve',
  ThreeWayValve: 'ThreeWayGlobeValve',
  // a self-acting regulator is a globe valve with its own actuator
  PressureReducingValve: 'GlobeValve',
  BreatherValve: 'BreatherValve',
  RuptureDisc: 'RuptureDisc',
  Strainer: 'Strainer',
  FlameArrestor: 'FlameArrestor',
  SteamTrap: 'SteamTrap',
  SightGlass: 'SightGlass',
  RestrictionOrifice: 'RestrictionOrifice',
  PipeReducer: 'PipeReducer',
  FlexibleHose: 'Hose',
  BlindFlange: 'BlindFlange',
  Funnel: 'Funnel',
  Vent: 'VentilationDevice',
  Silencer: 'Silencer',
}

const LOCATIONS: Record<string, string> = {
  field: 'Field',
  panel: 'CentralLocation',
  'behind-panel': 'CentralLocation',
  dcs: 'CentralLocation',
  plc: 'CentralLocation',
}

export interface DexpiResult {
  xml: string
  /** what didn't go across, and why */
  notes: string[]
  /** how many of each thing went across */
  counts: {
    equipment: number
    lines: number
    segments: number
    instruments: number
    loops: number
  }
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** an element with its attributes and children, indented by the caller */
function el(
  tag: string,
  attrs: Record<string, string | number | undefined>,
  children: string[] = [],
): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('')
  if (!children.length) return `<${tag}${a}/>`
  const inner = children
    .join('\n')
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n')
  return `<${tag}${a}>\n${inner}\n</${tag}>`
}

const attr = (name: string, value: string | undefined) =>
  value
    ? el('GenericAttribute', {
        Name: name,
        AttributeURI: `${RDL}${name}`,
        Format: 'string',
        Value: value,
      })
    : ''

const attrs = (list: string[]) => {
  const items = list.filter(Boolean)
  return items.length
    ? [
        el(
          'GenericAttributes',
          { Set: 'DexpiAttributes', Number: items.length },
          items,
        ),
      ]
    : []
}

const assoc = (type: string, id: string) =>
  el('Association', { Type: type, ItemID: id })

export function toDexpi(
  scene: Scene,
  opts: { version?: string; now?: Date } = {},
): DexpiResult {
  if (scene.drawing !== 'pid')
    throw new Error(
      `DEXPI describes P&IDs; this sheet is ${scene.drawing ?? 'pictorial'}. Set "drawing": "pid" to export it`,
    )
  const notes: string[] = []
  const now = opts.now ?? new Date()
  const shown = shownParts(scene)
  const parts = scene.parts.filter((p) => shown.has(p.id))
  const byId = new Map(parts.map((p) => [p.id, p]))
  const cls = (p: PartSpec) => classOf(p, scene)

  // sheet units to millimetres on A3, y running up as DEXPI has it
  const { w, h } = sheetSize(scene)
  const k = Math.min(400 / w, 277 / h)
  const mm = ([x, y]: Pt): [number, number] => [
    Math.round((10 + x * k) * 10) / 10,
    Math.round((10 + (h - y) * k) * 10) / 10,
  ]
  const position = (pt: Pt) => {
    const [x, y] = mm(pt)
    return el('Position', {}, [
      el('Location', { X: x, Y: y, Z: 0 }),
      el('Axis', { X: 0, Y: 0, Z: 1 }),
      el('Reference', { X: 1, Y: 0, Z: 0 }),
    ])
  }

  // ids, readable and unique
  const used = new Map<string, number>()
  const newId = (base: string) => {
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return `${base}-${n}`
  }

  const kindOf = (p: PartSpec) => {
    const c = cls(p)
    if (!c) return 'none'
    if (c === 'OffPageConnector') return 'offpage'
    if (c in PIPING) return 'piping'
    if (c in EQUIPMENT) return 'equipment'
    return 'none'
  }

  // the lines DEXPI carries: process and utility lines a P&ID draws
  const pipes = scene.links.filter(
    (l) =>
      shows(l, scene) &&
      !l.loss &&
      byId.has(l.from) &&
      byId.has(l.to) &&
      // a pipe to something DEXPI can't name has nowhere to connect
      kindOf(byId.get(l.from)!) !== 'none' &&
      kindOf(byId.get(l.to)!) !== 'none' &&
      (lineOf(l) === 'process' || lineOf(l) === 'utility'),
  )
  // a twin running back the same way is one pipe
  const seen = new Set<string>()
  const runs = pipes.filter((l) => {
    const key = [l.from, l.to].sort().join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  for (const p of parts)
    if (kindOf(p) === 'none')
      notes.push(
        `${p.tag ?? p.id}: no DEXPI class for ${cls(p) ?? p.kind}, so it is left out`,
      )

  // equipment, each with a nozzle per pipe end
  const equipIds = new Map<string, string>()
  const nozzles = new Map<string, string>() // `${linkIndex}:${partId}` → nozzle id
  const equipment: string[] = []
  for (const p of parts) {
    if (kindOf(p) !== 'equipment') continue
    const dc = EQUIPMENT[cls(p)!]!
    const id = newId(dc)
    equipIds.set(p.id, id)
    const own = runs
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.from === p.id || l.to === p.id)
    const nz = own.map(({ l, i }) => {
      const nid = newId('Nozzle')
      nozzles.set(`${i}:${p.id}`, nid)
      return el(
        'Nozzle',
        {
          ID: nid,
          ComponentClass: 'Nozzle',
          ComponentClassURI: 'http://data.posccaesar.org/rdl/RDS415214',
        },
        [
          el('ConnectionPoints', { NumPoints: 2 }, [
            el('Node', { ID: `${nid}-DefaultNode` }),
            el('Node', { ID: `${nid}-Process`, Type: 'process' }),
          ]),
          position(cellToPx(p.at)),
          ...attrs([
            attr(
              'NozzleIdAssignmentClass',
              `N${own.findIndex((o) => o.l === l) + 1}`,
            ),
          ]),
        ],
      )
    })
    const tag = p.tag ? splitTag(p.tag) : undefined
    equipment.push(
      el(
        'Equipment',
        {
          ID: id,
          ComponentClass: dc,
          ComponentClassURI: `${RDL}${dc}`,
          ComponentName: p.label,
        },
        [
          position(cellToPx(p.at)),
          ...attrs([
            attr('TagNameAssignmentClass', p.tag?.replace('-', '')),
            attr('TagNamePrefixAssignmentClass', tag?.letters),
            attr('TagNameSequenceNumberAssignmentClass', tag?.loop),
            attr('EquipmentDescriptionAssignmentClass', p.label),
          ]),
          ...nz,
        ],
      ),
    )
  }

  // piping: a segment runs from a nozzle or off-page connector to the next,
  // carrying the valves set in it; a system gathers a line number's segments
  const isInline = (id: string) => {
    const p = byId.get(id)
    return !!p && kindOf(p) === 'piping' && cls(p) !== 'Junction'
  }
  const into = (id: string) => runs.filter((l) => l.to === id)
  const outOf = (id: string) => runs.filter((l) => l.from === id)
  const pipingIds = new Map<string, string>()
  const placed = new Set<string>()
  const offIds = new Map<string, string>()
  const systems = new Map<string, string[]>() // line number → segments
  const actuated = new Map<string, string>() // control valve part → its component id
  let segments = 0

  // a line keeps its number through a valve unless the pipe after it has its own
  const renumbers = (l: LinkSpec) => {
    const before = into(l.from)[0]
    return !!l.tag && !!before?.tag && before.tag !== l.tag
  }
  const startsRun = (l: LinkSpec) =>
    !isInline(l.from) || into(l.from).length !== 1 || renumbers(l)
  for (const first of runs.filter(startsRun)) {
    // walk on through inline valves, one pipe in and one out
    const chain = [first]
    for (;;) {
      const last = chain.at(-1)!
      if (!isInline(last.to)) break
      const next = outOf(last.to)
      if (next.length !== 1 || chain.includes(next[0]!) || renumbers(next[0]!))
        break
      chain.push(next[0]!)
    }
    const head: string[] = []
    const items: string[] = []
    const endOf = (partId: string, link: LinkSpec, flowIn: boolean) => {
      const p = byId.get(partId)!
      const kind = kindOf(p)
      if (kind === 'equipment')
        return nozzles.get(`${runs.indexOf(link)}:${partId}`)!
      if (kind === 'offpage') {
        if (!offIds.has(partId)) {
          const dc = flowIn
            ? 'FlowInPipeOffPageConnector'
            : 'FlowOutPipeOffPageConnector'
          const id = newId(dc)
          offIds.set(partId, id)
          // a connector the line starts from comes before its centre line
          ;(flowIn ? head : items).push(
            el(
              'PipeOffPageConnector',
              { ID: id, ComponentClass: dc, ComponentClassURI: `${RDL}${dc}` },
              [
                el('ConnectionPoints', {
                  NumPoints: 2,
                  ...(flowIn ? { FlowOut: 1 } : { FlowIn: 1 }),
                }),
                position(cellToPx(p.at)),
                ...attrs([
                  attr('PipeOffPageConnectorNameAssignmentClass', p.label),
                ]),
              ],
            ),
          )
        }
        return offIds.get(partId)!
      }
      return pipingComponent(p, items)
    }
    const pipingComponent = (p: PartSpec, into: string[]) => {
      if (!pipingIds.has(p.id)) {
        const dc = PIPING[cls(p)!]!
        const id = newId(dc)
        pipingIds.set(p.id, id)
        if (cls(p) === 'ControlValve') actuated.set(p.id, id)
        into.push(
          el(
            'PipingComponent',
            { ID: id, ComponentClass: dc, ComponentClassURI: `${RDL}${dc}` },
            [
              el('ConnectionPoints', { NumPoints: 3, FlowIn: 1, FlowOut: 2 }, [
                el('Node', { ID: `${id}-DefaultNode` }),
                el('Node', { ID: `${id}-In`, Type: 'process' }),
                el('Node', { ID: `${id}-Out`, Type: 'process' }),
              ]),
              position(cellToPx(p.at)),
              ...attrs([attr('PipingComponentNumberAssignmentClass', p.tag)]),
            ],
          ),
        )
        placed.add(p.id)
      }
      return pipingIds.get(p.id)!
    }
    const from = endOf(first.from, first, true)
    for (const l of chain.slice(0, -1)) pipingComponent(byId.get(l.to)!, items)
    const end = chain.at(-1)!
    const to = endOf(end.to, end, false)
    const pts = chain.flatMap((l, i) => {
      const p = linkPoints(scene, l, false)
      return i ? p.slice(1) : p
    })
    const line = chain.find((l) => l.tag)?.tag
    const m = line ? /^(\d+(?:\.\d+)?)"?-([A-Z]{1,4})-(.+)$/.exec(line) : null
    const segId = newId('PipingNetworkSegment')
    segments++
    const segment = el(
      'PipingNetworkSegment',
      {
        ID: segId,
        ComponentClass: 'PipingNetworkSegment',
        ComponentClassURI: `${RDL}PipingNetworkSegment`,
      },
      [
        ...attrs([
          attr('FluidCodeAssignmentClass', m?.[2]),
          attr(
            'NominalDiameterNumericalValueRepresentationAssignmentClass',
            m?.[1],
          ),
          attr(
            'NominalDiameterRepresentationAssignmentClass',
            m ? `DN ${m[1]}` : undefined,
          ),
          attr('SegmentNumberAssignmentClass', `S${segments}`),
        ]),
        ...head,
        el(
          'CenterLine',
          { NumPoints: pts.length },
          pts.map((pt) => {
            const [x, y] = mm(pt)
            return el('Coordinate', { X: x, Y: y, Z: 0 })
          }),
        ),
        ...items,
        // a pipe leaves a valve from its outlet, node 2; everything else has one node
        el('Connection', {
          FromID: from,
          FromNode: [...pipingIds.values()].includes(from) ? 2 : 1,
          ToID: to,
          ToNode: 1,
        }),
      ],
    )
    const key = line ?? `unnumbered ${segId}`
    systems.set(key, [...(systems.get(key) ?? []), segment])
  }
  for (const p of parts)
    if (kindOf(p) === 'piping' && !placed.has(p.id))
      notes.push(
        `${p.tag ?? p.id}: a ${cls(p)} must sit in a pipe, and this one has none, so it is left out`,
      )

  const piping = [...systems].map(([line, segs]) => {
    const m = /^(\d+(?:\.\d+)?)"?-([A-Z]{1,4})-(.+)$/.exec(line)
    return el(
      'PipingNetworkSystem',
      {
        ID: newId('PipingNetworkSystem'),
        ComponentClass: 'PipingNetworkSystem',
        ComponentClassURI: `${RDL}PipingNetworkSystem`,
      },
      [
        ...attrs([
          attr(
            'LineNumberAssignmentClass',
            line.startsWith('unnumbered') ? undefined : line,
          ),
          attr('FluidCodeAssignmentClass', m?.[2]),
          attr(
            'NominalDiameterNumericalValueRepresentationAssignmentClass',
            m?.[1],
          ),
        ]),
        ...segs,
      ],
    )
  })
  if ([...systems.keys()].some((k) => k.startsWith('unnumbered')))
    notes.push(
      'some lines have no number, so their piping systems carry none; check_drawing lists them',
    )

  // instruments: each is a process instrumentation function in its loop
  const insts = scene.instruments ?? []
  const pifIds = new Map(
    insts.map((x) => [x.tag, newId('ProcessInstrumentationFunction')]),
  )
  // the signal an instrument reads from another, named before either is written
  const incoming = new Map(
    insts
      .filter((x) => insts.some((o) => o.tag === x.measures))
      .map((x) => [x.tag, newId('SignalConveyingFunction')]),
  )
  const loops = new Map<string, string[]>()
  const actuating: string[] = []
  const functions = insts.map((x: InstrumentSpec) => {
    const id = pifIds.get(x.tag)!
    const { letters, loop } = splitTag(x.tag)
    loops.set(loop, [...(loops.get(loop) ?? []), id])
    const children: string[] = []
    const links: string[] = []
    const upstream = insts.find((o) => o.tag === x.measures)
    const part = byId.get(x.measures)
    if (part) {
      // measured on the part: a sensing function located in it, and the line to the bubble
      const psg = newId('ProcessSignalGeneratingFunction')
      const flow = newId('MeasuringLineFunction')
      const where =
        equipIds.get(part.id) ?? pipingIds.get(part.id) ?? offIds.get(part.id)
      links.push(assoc('is logical end of', flow))
      children.push(
        el(
          'InformationFlow',
          {
            ID: flow,
            ComponentClass: 'MeasuringLineFunction',
            ComponentClassURI: `${RDL}MeasuringLineFunction`,
          },
          [assoc('has logical start', psg), assoc('has logical end', id)],
        ),
        el(
          'ProcessSignalGeneratingFunction',
          {
            ID: psg,
            ComponentClass: 'ProcessSignalGeneratingFunction',
            ComponentClassURI: `${RDL}ProcessSignalGeneratingFunction`,
          },
          [
            ...attrs([
              attr(
                'ProcessSignalGeneratingFunctionNumberAssignmentClass',
                `${letters[0]}E${loop}`,
              ),
            ]),
            assoc('is logical start of', flow),
            ...(where ? [assoc('is located in', where)] : []),
          ],
        ),
      )
    } else if (upstream) {
      const flow = incoming.get(x.tag)!
      links.push(assoc('is logical end of', flow))
      children.push(
        el(
          'InformationFlow',
          {
            ID: flow,
            ComponentClass: 'SignalConveyingFunction',
            ComponentClassURI: `${RDL}SignalConveyingFunction`,
          },
          [
            assoc('has logical start', pifIds.get(upstream.tag)!),
            assoc('has logical end', id),
          ],
        ),
      )
    }
    const valve = x.drives
      ? (actuated.get(x.drives) ?? pipingIds.get(x.drives))
      : undefined
    if (x.drives && !valve)
      notes.push(
        `${x.tag} drives ${x.drives}, which isn't a valve in a pipe, so its actuation is left out`,
      )
    if (valve) {
      const driven = byId.get(x.drives!)!
      const number = driven.tag?.replace('-', '') ?? `${letters[0]}V${loop}`
      const af = newId('ActuatingFunction')
      const sys = newId('ActuatingSystem')
      const flow = newId('SignalConveyingFunction')
      const actuator = newId('ControlledActuator')
      links.push(assoc('is logical start of', flow))
      children.push(
        el(
          'InformationFlow',
          {
            ID: flow,
            ComponentClass: 'SignalConveyingFunction',
            ComponentClassURI: `${RDL}SignalConveyingFunction`,
          },
          [assoc('has logical start', id), assoc('has logical end', af)],
        ),
        el(
          'ActuatingFunction',
          {
            ID: af,
            ComponentClass: 'ActuatingFunction',
            ComponentClassURI: `${RDL}ActuatingFunction`,
          },
          [
            ...attrs([attr('ActuatingFunctionNumberAssignmentClass', number)]),
            assoc('is logical end of', flow),
            assoc('is fulfilled by', sys),
          ],
        ),
      )
      actuating.push(
        el(
          'ActuatingSystem',
          {
            ID: sys,
            ComponentClass: 'ActuatingSystem',
            ComponentClassURI: `${RDL}ActuatingSystem`,
          },
          [
            ...attrs([attr('ActuatingSystemNumberAssignmentClass', number)]),
            assoc('fulfills', af),
            el(
              'ActuatingSystemComponent',
              {
                ID: actuator,
                ComponentClass: 'ControlledActuator',
                ComponentClassURI: `${RDL}ControlledActuator`,
              },
              [...attrs([attr('SubTagNameAssignmentClass', `${number}_YC`)])],
            ),
            el(
              'ActuatingSystemComponent',
              {
                ID: newId('OperatedValveReference'),
                ComponentClass: 'OperatedValveReference',
                ComponentClassURI: `${RDL}OperatedValveReference`,
              },
              [
                ...attrs([attr('SubTagNameAssignmentClass', `${number}_YV`)]),
                assoc('refers to', valve),
              ],
            ),
          ],
        ),
      )
    }
    // an instrument further on reads this one
    for (const o of insts)
      if (o.measures === x.tag)
        links.push(assoc('is logical start of', incoming.get(o.tag)!))
    return { id, x, letters, loop, children, links }
  })
  const instrumentation = functions.map((f) =>
    el(
      'ProcessInstrumentationFunction',
      {
        ID: f.id,
        ComponentClass: 'ProcessInstrumentationFunction',
        ComponentClassURI: `${RDL}ProcessInstrumentationFunction`,
      },
      [
        position(cellToPx(f.x.at)),
        ...attrs([
          attr('LocationSpecialization', LOCATIONS[f.x.mounting ?? 'field']),
          attr(
            'ProcessInstrumentationFunctionCategoryAssignmentClass',
            f.letters[0],
          ),
          attr('ProcessInstrumentationFunctionNumberAssignmentClass', f.loop),
          attr(
            'ProcessInstrumentationFunctionsAssignmentClass',
            f.letters.slice(1),
          ),
        ]),
        ...f.links,
        assoc('is a part of', `Loop:${f.loop}`),
        ...f.children,
      ],
    ),
  )
  const loopIds = new Map(
    [...loops.keys()].map((l) => [l, newId('InstrumentationLoopFunction')]),
  )
  const loopEls = [...loops].map(([loop, members]) =>
    el(
      'InstrumentationLoopFunction',
      {
        ID: loopIds.get(loop)!,
        ComponentClass: 'InstrumentationLoopFunction',
        ComponentClassURI: `${RDL}InstrumentationLoopFunction`,
      },
      [
        ...attrs([
          attr('InstrumentationLoopFunctionNumberAssignmentClass', loop),
        ]),
        ...members.map((m) => assoc('is a collection including', m)),
      ],
    ),
  )

  const tb = scene.titleBlock ?? {}
  const meta = el(
    'MetaData',
    {
      ID: 'MetaData-1',
      ComponentClass: 'MetaData',
      ComponentClassURI: `${RDL}MetaData`,
    },
    attrs([
      attr('DrawingNameAssignmentClass', scene.title),
      attr('DrawingNumberAssignmentClass', scene.sheet),
      attr('DrawingSubTitleAssignmentClass', scene.subtitle),
      attr('EnterpriseNameAssignmentClass', tb.owner),
      attr('ProjectNameAssignmentClass', tb.project),
      attr('DrafterNameAssignmentClass', tb.drawnBy),
      attr('CheckerNameAssignmentClass', tb.checkedBy),
      attr('ApproverNameAssignmentClass', tb.approvedBy),
      attr('CreationDateRepresentationAssignmentClass', tb.issued),
      attr('RevisionNumberAssignmentClass', tb.revision),
      attr('ApprovalDescriptionAssignmentClass', tb.status),
      attr('SheetFormatAssignmentClass', 'ISO A3'),
    ]),
  )
  const pad = (n: number) => String(n).padStart(2, '0')
  const info = el(
    'PlantInformation',
    {
      Application: 'Dexpi',
      ApplicationVersion: '1.3',
      Date: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
      Time: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`,
      Discipline: 'PID',
      Is3D: 'no',
      OriginatingSystem: 'Anigram',
      OriginatingSystemVendor: 'Anigram (MIT), Vaibhav Patel',
      OriginatingSystemVersion: opts.version ?? '',
      SchemaVersion: '4.1.1',
      Units: 'mm',
    },
    [el('UnitsOfMeasure', { Distance: 'Millimetre' })],
  )
  const drawing = el(
    'Drawing',
    {
      Name: scene.sheet || scene.id,
      Type: 'PID',
      Title: scene.title,
      Size: 'A3',
    },
    [
      el('Presentation', { R: 1, G: 1, B: 1 }),
      el('Extent', {}, [
        el('Min', { X: 0, Y: 0 }),
        el('Max', { X: 420, Y: 297 }),
      ]),
    ],
  )

  let body = [
    info,
    meta,
    ...actuating,
    ...piping,
    ...instrumentation,
    ...equipment,
    ...loopEls,
    drawing,
  ].join('\n')
  // loops are referenced before they are numbered
  body = body.replace(
    /ItemID="Loop:([^"]*)"/g,
    (_, l: string) => `ItemID="${loopIds.get(l)}"`,
  )
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${el('PlantModel', {}, [body])}\n`
  return {
    xml,
    notes,
    counts: {
      equipment: equipment.length,
      lines: piping.length,
      segments,
      instruments: insts.length,
      loops: loops.size,
    },
  }
}
