// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * One family classifier for both kinds of run. An item is classified from
 * the words that say what it is: an Anigram part's DEXPI class, kind and
 * label, or a bare run's free-text `type` and label. The same keyword table
 * reads both, so neither side is rewarded for using the other's vocabulary.
 *
 * An item gets a *set* of families, specific first: a vessel labelled
 * "flash drum" is { separator?, drum, vessel, container }. A requirement
 * names one family or several; it is met when the sets meet.
 */

/** equipment families: a major item a pipe ends at, not one it passes through */
export const EQUIPMENT = new Set([
  'pump',
  'compressor',
  'fan',
  'container',
  'tank',
  'vessel',
  'drum',
  'separator',
  'column',
  'reactor',
  'heat-exchanger',
  'boiler',
  'cooling-tower',
  'filter',
  'mixer',
  'agitator',
  'turbine',
  'motor',
  'ejector',
  'wet-well',
  'dampener',
])

/** things a process line may pass through on its way between two items */
export const PASSABLE = new Set([
  'valve',
  'junction',
  'fitting',
  'strainer',
  'instrument',
  'inline-instrument',
  'spool',
])

const VALVE_WORDS = [
  // order matters: the first rule that matches wins
  [/rupture|bursting/, ['relief', 'rupture-disc']],
  [
    /breather|pvrv|vacuum relief|pressure.?vacuum|conservation vent/,
    ['relief', 'breather'],
  ],
  [/safety|relief|\bpsv\b|\btsv\b|\bsrv\b|pop.?off/, ['relief']],
  [/\bprv\b/, ['regulator', 'relief']],
  [/reduc|regulat|self.?acting|back.?pressure|\bpcv\b/, ['regulator']],
  [/check|non.?return|\bnrv\b|reflux valve|foot valve|flap valve/, ['check']],
  [
    /control|\bcv\b|modulat|throttl|\blcv\b|\bfcv\b|\btcv\b|\bfv\b|\blv\b|\btv\b|\bpv\b|anti.?surge|recycle valve|positioner/,
    ['control'],
  ],
  [
    /shut.?down|\bsdv\b|\besdv?\b|on.?off|on\/off|solenoid|\bxv\b|actuated|motori[sz]ed|actuator|\bmov\b|\bhv\b|trip valve|emergency/,
    ['onoff'],
  ],
  [
    /gate|ball|butterfly|globe|plug|isolat|block|shut.?off|manual|hand|drain|vent|needle|diaphragm valve|knife|root valve|valve/,
    ['isolation'],
  ],
]

const EQUIPMENT_WORDS = [
  // fittings and lines first: they are not equipment
  [
    /off.?page|off.?sheet|battery limit|tie.?in|connector|continuation/,
    ['offpage'],
  ],
  [/strainer|y.?strainer|basket/, ['strainer', 'filter']],
  [
    /\btee\b|junction|manifold|header|reducer|spool|blind|flange|spectacle|union/,
    ['junction'],
  ],
  [/calibration (pot|column|tube)/, ['instrument']],
  [/cooling tower/, ['cooling-tower']],
  [
    /wet.?well|sump|pump.?pit|lift station well/,
    ['wet-well', 'tank', 'container'],
  ],
  [
    /column|tower|stripper|absorber|scrubber column|fractionat/,
    ['column', 'vessel', 'container'],
  ],
  [/reactor|cstr|digester/, ['reactor', 'vessel', 'container']],
  [/deaerator/, ['vessel', 'drum', 'container']],
  [
    /separator|knock.?out|scrubber|flash (drum|vessel)|\bslug\b|settler|decanter|coalesc/,
    ['separator', 'vessel', 'container'],
  ],
  [
    /receiver|accumulator|reflux drum|drum|pot\b|surge vessel|pressure vessel|\bvessel\b|bullet|sphere/,
    ['drum', 'vessel', 'container'],
  ],
  [/boiler|steam generator|fired heater|furnace/, ['boiler', 'heat-exchanger']],
  [
    /heat exchanger|exchanger|cooler|condenser|reboiler|heater|chiller|economi[sz]er|preheater|\bhx\b|shell.?and.?tube|plate (heat|cooler)|calandria|jacket|coil/,
    ['heat-exchanger'],
  ],
  [/compressor|blower(?!.*fan)/, ['compressor']],
  [/\bfan\b|blower/, ['fan']],
  [/dampener|pulsation|damper pot/, ['dampener', 'vessel', 'container']],
  [/pump/, ['pump']],
  [/filter|cartridge|bag filter|sand filter|membrane|cyclone/, ['filter']],
  [/static mixer|mixer|blender|mixing/, ['mixer']],
  [/agitator|stirrer/, ['agitator']],
  [/turbine|expander/, ['turbine']],
  [/eductor|ejector/, ['ejector']],
  [/motor/, ['motor']],
  [
    /tank|tote|ibc|silo|\bbasin\b|reservoir|pond|pit|cistern|day tank|storage|hopper|bund/,
    ['tank', 'container'],
  ],
  // a stream that comes from or goes to somewhere off the drawing
  [
    /^from\b|^to\b|^(source|sink|destination|inlet|outlet|feed|product|supply|return)$|supply\b|return\b|consumers?$|^users?$|^(flare|sewer|drain)\b|\bmain$|to atmosphere|downstream|upstream|\bunit$|plant$|network$|customers?$|town$/,
    ['offpage'],
  ],
]

/** what an instrument's words say it is; used only when a bare item's tag has no ISA letters */
const INSTRUMENT_WORDS =
  /transmitter|controller|indicator|gauge|switch|alarm|sensor|element|meter\b|flowmeter|flow meter|analy[sz]er|probe|thermocouple|\brtd\b|transducer|relay|instrument|interlock|\bdcs\b|\bplc\b|computing|converter|positioner|recorder|totali[sz]er|orifice|thermowell|\bfloat\b|level (switch|sensor)|\bbubble\b/

/** Anigram's P&ID classes, by family */
const CLASS_FAMILY = {
  CentrifugalPump: ['pump', 'pump-centrifugal'],
  PositiveDisplacementPump: ['pump', 'pump-pd'],
  Compressor: ['compressor'],
  Fan: ['fan'],
  Tank: ['tank', 'container'],
  Vessel: ['vessel', 'container'],
  HeatExchanger: ['heat-exchanger'],
  Filter: ['filter'],
  GateValve: ['valve', 'isolation'],
  GlobeValve: ['valve', 'isolation'],
  BallValve: ['valve', 'isolation'],
  ButterflyValve: ['valve', 'isolation'],
  CheckValve: ['valve', 'check'],
  SafetyValve: ['valve', 'relief'],
  ControlValve: ['valve', 'control'],
  ElectricMotor: ['motor'],
  Turbine: ['turbine'],
  Junction: ['junction'],
  OffPageConnector: ['offpage'],
}

/** Anigram pictorial kinds, for parts with no class */
const KIND_FAMILY = {
  pump: ['pump', 'pump-centrifugal'],
  heatpump: ['compressor'],
  compressor: ['compressor'],
  fan: ['fan'],
  valve: ['valve', 'isolation'],
  dcv: ['valve', 'onoff'],
  reservoir: ['tank', 'container'],
  watertower: ['tank', 'container'],
  fueltank: ['tank', 'container'],
  oiltank: ['tank', 'container'],
  hottank: ['vessel', 'container'],
  accumulator: ['vessel', 'container'],
  treatment: ['filter'],
  turbine: ['turbine'],
  motor: ['motor'],
  manifold: ['junction'],
  busbar: ['junction'],
  coolingtower: ['cooling-tower'],
}

const norm = (s) => String(s ?? '').toLowerCase()

/** normalise a tag for matching: upper case, no spaces, dashes, underscores or slashes */
// DIN 19227 / IEC 62424 marks inside a function code (PI(Z), PIS⁺Z⁺A) are
// notation, not letters, so they are dropped on both sides
const NOTATION = /[()+\u207a\u207b\u2212]/g

export const normTag = (t) =>
  String(t ?? '')
    .toUpperCase()
    .replace(NOTATION, '')
    .replace(/[\s\-_/]+/g, '')
    .replace(/\.$/, '')

/** ISA-5.1 reading of a tag: the letters before the loop number, and the number */
export function tagParts(tag) {
  const t = normTag(tag).replace(/^\d{1,4}(?=[A-Z])/, '')
  const m = /^([A-Z]{1,7})(\d[\dA-Z.]*)?$/.exec(t)
  return m ? { letters: m[1], number: m[2] ?? '' } : { letters: '', number: '' }
}

/** an equipment, valve or instrument tag that reads like ISA / plant practice */
export const isWellFormedTag = (tag) =>
  /^(\d{1,4}-)?[A-Z]{1,6}[- ]?\d{1,6}(\.\d{1,3})?[A-Z]?$/.test(
    String(tag ?? '')
      .toUpperCase()
      .replace(NOTATION, '')
      .trim(),
  )

const VARIABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function valveFamilies(text) {
  for (const [re, fams] of VALVE_WORDS)
    if (re.test(text)) return ['valve', ...fams]
  return ['valve', 'isolation']
}

/** the valve family an actuated valve's tag letters suggest */
function actuatedFromTag(tag) {
  const { letters } = tagParts(tag)
  if (/^(XV|SDV|ESDV|ESV|HV|UV|KV|MOV|BDV|ZV)/.test(letters)) return 'onoff'
  if (/^(PSV|PRV|TSV|SV|RV|PSE)/.test(letters)) return 'relief'
  if (/^[A-Z][A-Z]?C?V$/.test(letters)) return 'control'
  return undefined
}

function fromWords(text) {
  for (const [re, fams] of EQUIPMENT_WORDS) if (re.test(text)) return fams
  return undefined
}

/**
 * families for a free-text description (a bare run's `type`, or an Anigram
 * label when the class says nothing specific)
 */
export function classifyText(type, label = '', tag = '') {
  const t = norm(type)
  // a valve is a valve whatever else the words say ("pump discharge valve")
  if (/valve|\bpsv\b|\bprv\b|rupture|bursting disc|breather/.test(t))
    return valveFamilies(t)
  if (INSTRUMENT_WORDS.test(t)) return ['instrument']
  const eq = fromWords(t)
  if (eq) return eq
  // the type is unclear: try the label, then the tag
  if (/valve/.test(norm(label))) return valveFamilies(norm(label))
  if (INSTRUMENT_WORDS.test(norm(label))) return ['instrument']
  const fromLabel = fromWords(norm(label))
  if (fromLabel) return fromLabel
  const { letters } = tagParts(tag)
  const act = actuatedFromTag(tag)
  if (act) return ['valve', act]
  if (letters.length >= 2 && VARIABLE.includes(letters[0]))
    return ['instrument']
  if (/^P$/.test(letters)) return ['pump']
  if (/^(T|TK)$/.test(letters)) return ['tank', 'container']
  if (/^(V|D)$/.test(letters)) return ['vessel', 'container']
  if (/^(E|HX|H)$/.test(letters)) return ['heat-exchanger']
  if (/^(C|K)$/.test(letters)) return ['compressor', 'column']
  if (/^R$/.test(letters)) return ['reactor', 'vessel', 'container']
  if (/^F$/.test(letters)) return ['filter']
  return ['other']
}

/** families for an Anigram part on a P&ID */
export function classifyPart(part) {
  const label = norm(part.label)
  const role = part.behaviour?.role
  let fams = part.class ? CLASS_FAMILY[part.class] : undefined
  if (!fams && !part.class) fams = KIND_FAMILY[part.kind]
  if (!fams) {
    // no symbol of its own: what it stands for on a P&ID
    if (role === 'source' || role === 'sink' || role === 'vent') {
      const w = fromWords(label)
      fams =
        w && !w.includes('offpage') && EQUIPMENT.has(w[0]) ? w : ['offpage']
    } else if (role === 'bus') {
      const w = fromWords(label)
      fams = w && EQUIPMENT.has(w[0]) ? [...w, 'junction'] : ['junction']
    } else if (role === 'gate')
      fams =
        INSTRUMENT_WORDS.test(label) && !/valve/.test(label)
          ? ['instrument', 'inline-instrument']
          : valveFamilies(label)
    else fams = classifyText(part.class ?? part.kind, part.label, part.tag)
  }
  fams = [...fams]
  // a generic class read more closely from the label
  if (fams.includes('container')) {
    const w = fromWords(label)
    if (w && w.includes('container')) fams = [...new Set([...w, ...fams])]
  }
  if (fams.includes('valve')) {
    if (fams.includes('control')) {
      const a = actuatedFromTag(part.tag)
      if (
        a === 'onoff' ||
        /shut.?down|on.?off|trip|emergency|isolat/.test(label)
      )
        fams.push('onoff')
    }
    // a valve drawn with a general symbol but labelled for what it is
    const w = valveFamilies(label)
    if (!w.includes('isolation')) fams = [...new Set([...w, ...fams])]
  }
  if (
    fams.includes('heat-exchanger') ||
    fams.includes('filter') ||
    fams.includes('junction')
  ) {
    const w = fromWords(label)
    if (w) fams = [...new Set([...w, ...fams])]
  }
  if (fams.includes('pump')) {
    if (
      /metering|dosing|diaphragm|reciprocat|piston|plunger|screw|gear|lobe|peristaltic|progressive|positive/.test(
        label,
      )
    )
      fams.push('pump-pd')
  }
  return [...new Set(fams)]
}

/** finish a bare item's family set the way classifyPart finishes a part's */
export function classifyBare(item) {
  const fams = classifyText(item.type, item.label, item.tag)
  const out = [...fams]
  const t = `${norm(item.type)} ${norm(item.label)}`
  if (out.includes('pump')) {
    out.push(
      /metering|dosing|diaphragm|reciprocat|piston|plunger|screw|gear|lobe|peristaltic|progressive|positive/.test(
        t,
      )
        ? 'pump-pd'
        : 'pump-centrifugal',
    )
  }
  if (out.includes('valve') && out.includes('control')) {
    if (actuatedFromTag(item.tag) === 'onoff') out.push('onoff')
  }
  if (out.includes('valve') && out.includes('onoff') && /control/.test(t))
    out.push('control')
  return [...new Set(out)]
}

/** the broad kind of an item, from its families */
export function kindOf(fams) {
  if (fams.includes('instrument')) return 'instrument'
  if (fams.includes('valve')) return 'valve'
  if (fams.includes('offpage')) return 'offpage'
  if (fams.some((f) => f === 'junction' || f === 'fitting' || f === 'strainer'))
    return 'fitting'
  if (fams.some((f) => EQUIPMENT.has(f))) return 'equipment'
  return 'other'
}
