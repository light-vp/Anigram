// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { DrawingType } from '../sim/types.ts'

/*
 * A small, correct sheet for each drawing practice, for an assistant to
 * start from rather than a blank file, and the practice's house rules in a
 * few lines. Each starter validates with no warnings and its `expect` list
 * holds (see starters.test.ts), so editing one starts from something that
 * works. Plain JSON-shaped objects: what `new_scene` hands out is exactly
 * what a file would hold.
 */

const UNITS_WATER = { water: { rate: 'm³/h', amount: 'm³' } }
const UNITS_POWER = { electric: { rate: 'kW', amount: 'kWh' } }

const PID = {
  anigram: 1,
  id: 'pid-starter',
  title: 'Pumped transfer with level control',
  subtitle: 'A pump fills a tank; a level loop throttles the outlet',
  sheet: 'PID-100',
  drawing: 'pid',
  titleBlock: {
    owner: 'Your organisation',
    project: 'Your project',
    drawnBy: 'Initials',
    issued: '2026-01-01',
    revision: 'A',
    status: 'draft',
  },
  size: [8, 3],
  units: { ...UNITS_WATER, ...UNITS_POWER },
  scale: { water: 100, electric: 30 },
  clock: { start: 6, rate: 1 },
  parts: [
    {
      id: 'feed',
      kind: 'river',
      label: 'From intake',
      at: [0, 1],
      behaviour: { role: 'source', output: 120 },
    },
    {
      id: 'power',
      kind: 'grid',
      label: 'Electricity',
      at: [1, 2],
      behaviour: { role: 'source', output: 50, dispatchable: true },
    },
    {
      id: 'pump',
      kind: 'pump',
      label: 'Transfer pump',
      tag: 'P-101',
      class: 'CentrifugalPump',
      at: [1, 1],
      behaviour: {
        role: 'converter',
        output: 'water',
        recipe: { electric: 0.25, water: 1 },
        capacity: 90,
      },
    },
    {
      id: 'tank',
      kind: 'reservoir',
      label: 'Buffer tank',
      tag: 'T-101',
      class: 'Tank',
      at: [3, 1],
      behaviour: {
        role: 'storage',
        capacity: 200,
        start: 0.6,
        maxIn: 90,
        maxOut: 150,
        refill: { below: 0.5, until: 0.95 },
      },
    },
    {
      id: 'lv',
      kind: 'valve',
      label: 'Level control valve',
      tag: 'LV-101',
      class: 'ControlValve',
      at: [5, 1],
      behaviour: {
        role: 'gate',
        capacity: 150,
        open: "clamp((prev('tank').fill - 0.2) / 0.3, 0, 1)",
      },
    },
    {
      id: 'user',
      kind: 'factory',
      label: 'To process',
      at: [7, 1],
      behaviour: {
        role: 'sink',
        demand: '110 * shift(hour) + 20',
      },
    },
  ],
  links: [
    { from: 'feed', to: 'pump', domain: 'water', tag: '100-W-001' },
    { from: 'power', to: 'pump', domain: 'electric' },
    { from: 'pump', to: 'tank', domain: 'water', tag: '80-W-002' },
    { from: 'tank', to: 'lv', domain: 'water', tag: '100-W-003' },
    { from: 'lv', to: 'user', domain: 'water', tag: '100-W-004' },
  ],
  instruments: [
    { tag: 'LT-101', at: [3, 0], measures: 'tank', low: 25 },
    {
      tag: 'LIC-101',
      at: [5, 0],
      measures: 'LT-101',
      drives: 'lv',
      mounting: 'dcs',
    },
  ],
  expect: [
    {
      says: 'The level loop keeps the tank from running dry',
      check: "part('tank').fill > 0.15",
    },
    {
      says: 'Through the shift the outlet is throttled to protect the tank',
      check: "part('user').in < part('user').demand",
      sometime: true,
    },
  ],
}

const SINGLE_LINE = {
  anigram: 1,
  id: 'single-line-starter',
  title: 'Site supply with standby generation',
  subtitle:
    'A transformer feeds the site board; a standby set carries the essential load when the supply drops out',
  sheet: 'SLD-100',
  drawing: 'single-line',
  symbols: 'iec',
  titleBlock: {
    owner: 'Your organisation',
    project: 'Your project',
    drawnBy: 'Initials',
    issued: '2026-01-01',
    revision: 'A',
    status: 'draft',
  },
  size: [7, 3],
  units: {
    electric: { rate: 'kW', amount: 'kWh' },
    fuel: { rate: 'kW', amount: 'kWh' },
  },
  scale: { electric: 1000, fuel: 1000 },
  clock: { start: 8, rate: 1 },
  parts: [
    {
      id: 'supply',
      kind: 'grid',
      label: '11 kV supply',
      tag: '-X1',
      at: [0, 0],
      note: 'A planned outage from 13:00 to 15:00.',
      behaviour: {
        role: 'source',
        output: 'between(hour, 13, 15) ? 0 : 1500',
      },
    },
    {
      id: 'tx',
      kind: 'transformer',
      label: '11/0.4 kV',
      tag: '-T1',
      at: [1, 0],
      behaviour: {
        role: 'converter',
        output: 'electric',
        recipe: { electric: 1.02 },
        capacity: 1250,
      },
    },
    {
      id: 'q1',
      kind: 'breaker',
      label: 'Incomer',
      tag: '-Q1',
      at: [2, 0],
      behaviour: { role: 'gate', capacity: 1250 },
    },
    {
      id: 'board',
      kind: 'busbar',
      label: 'Main board',
      tag: '-W1',
      at: [4, 0],
      behaviour: { role: 'bus' },
    },
    {
      id: 'q2',
      kind: 'breaker',
      label: 'Process feeder',
      tag: '-Q2',
      at: [3, 1],
      labelSide: 'right',
      behaviour: { role: 'gate', capacity: 800 },
    },
    {
      id: 'q3',
      kind: 'breaker',
      label: 'Essential feeder',
      tag: '-Q3',
      at: [5, 1],
      labelSide: 'right',
      behaviour: { role: 'gate', capacity: 400 },
    },
    {
      id: 'process',
      kind: 'factory',
      label: 'Process loads',
      tag: '-E1',
      at: [3, 2],
      behaviour: {
        role: 'sink',
        demand: '500 * shift(hour) + 80',
        priority: 1,
      },
    },
    {
      id: 'essential',
      kind: 'hospital',
      label: 'Essential loads',
      tag: '-E2',
      at: [5, 2],
      behaviour: { role: 'sink', demand: 180, priority: 2 },
    },
    {
      id: 'diesel',
      kind: 'fueltank',
      label: 'Diesel',
      at: [6, 1],
      behaviour: {
        role: 'storage',
        capacity: 20000,
        start: 1,
        maxIn: 0,
        maxOut: 2000,
      },
    },
    {
      id: 'q4',
      kind: 'breaker',
      label: 'Generator breaker',
      tag: '-Q4',
      at: [5, 0],
      labelSide: 'above',
      behaviour: { role: 'gate', capacity: 400 },
    },
    {
      id: 'gen',
      kind: 'generator',
      label: 'Standby set',
      tag: '-G1',
      at: [6, 0],
      behaviour: {
        role: 'converter',
        output: 'electric',
        recipe: { fuel: 2.8 },
        capacity: 400,
      },
    },
  ],
  links: [
    { from: 'supply', to: 'tx', domain: 'electric' },
    { from: 'tx', to: 'q1', domain: 'electric' },
    { from: 'q1', to: 'board', domain: 'electric' },
    { from: 'board', to: 'q2', domain: 'electric' },
    { from: 'q2', to: 'process', domain: 'electric' },
    { from: 'board', to: 'q3', domain: 'electric' },
    { from: 'q3', to: 'essential', domain: 'electric' },
    { from: 'diesel', to: 'gen', domain: 'fuel' },
    { from: 'gen', to: 'q4', domain: 'electric' },
    { from: 'q4', to: 'board', domain: 'electric' },
  ],
  expect: [
    {
      says: 'With the supply on, the standby set stays off',
      check: "part('gen').out < 1",
      at: 10,
    },
    {
      says: 'In the outage the standby set carries the essential load in full',
      check:
        "part('gen').out > 0 && part('essential').in >= part('essential').demand * 0.99",
      at: 14,
    },
  ],
}

const PFD = {
  anigram: 1,
  id: 'pfd-starter',
  title: 'Boiler house with thermal store',
  subtitle:
    'A gas boiler tops up a thermal store, and the store carries the heat network through its peaks',
  sheet: 'PFD-100',
  drawing: 'pfd',
  titleBlock: {
    owner: 'Your organisation',
    project: 'Your project',
    drawnBy: 'Initials',
    issued: '2026-01-01',
    revision: 'A',
    status: 'draft',
  },
  size: [7, 3],
  units: {
    heat: { rate: 'kW', amount: 'kWh' },
    fuel: { rate: 'kW', amount: 'kWh' },
  },
  scale: { heat: 800, fuel: 800 },
  clock: { start: 0, rate: 1 },
  parts: [
    {
      id: 'gas',
      kind: 'gaswell',
      label: 'Gas supply',
      at: [0, 1],
      behaviour: { role: 'source', output: 2000, dispatchable: true },
    },
    {
      id: 'boiler',
      kind: 'heatpump',
      label: 'Boiler',
      tag: 'B-101',
      class: 'HeatExchanger',
      at: [2, 1],
      behaviour: {
        role: 'converter',
        output: 'heat',
        recipe: { fuel: 1.12 },
        capacity: 600,
      },
    },
    {
      id: 'flue',
      kind: 'sky',
      label: 'Flue',
      at: [2, 0],
      labelSide: 'right',
      behaviour: { role: 'vent' },
    },
    {
      id: 'store',
      kind: 'hottank',
      label: 'Thermal store',
      tag: 'TK-101',
      class: 'Vessel',
      at: [4, 1],
      behaviour: {
        role: 'storage',
        capacity: 2400,
        start: 0.5,
        maxIn: 600,
        maxOut: 900,
        refill: { below: 0.4, until: 0.95 },
      },
    },
    {
      id: 'town',
      kind: 'city',
      label: 'Heat network',
      at: [6, 1],
      behaviour: { role: 'sink', demand: '900 * heating(hour)' },
    },
  ],
  links: [
    { from: 'gas', to: 'boiler', domain: 'fuel', tag: '1' },
    { from: 'boiler', to: 'flue', domain: 'heat', loss: true },
    { from: 'boiler', to: 'store', domain: 'heat', tag: '2' },
    { from: 'store', to: 'town', domain: 'heat', tag: '3' },
  ],
  expect: [
    {
      says: 'The heat network is kept warm all day',
      check: "part('town').in >= part('town').demand * 0.97",
    },
    {
      says: 'At the peak the store gives more than the boiler can make',
      check: "part('store').out > 600",
      sometime: true,
    },
  ],
}

const PICTORIAL = {
  anigram: 1,
  id: 'sheet-starter',
  title: 'A small solar house',
  subtitle:
    'Panels on the roof, a battery for the evening, and the grid for the rest',
  sheet: 'LD-100',
  size: [5, 3],
  units: {
    light: { rate: 'kW', amount: 'kWh' },
    electric: { rate: 'kW', amount: 'kWh' },
  },
  scale: { light: 5, electric: 4 },
  clock: { start: 6, rate: 1 },
  parts: [
    {
      id: 'sun',
      kind: 'sun',
      label: 'Sun',
      at: [0, 0],
      behaviour: { role: 'source', output: '5 * sun(hour)' },
    },
    {
      id: 'pv',
      kind: 'pv',
      label: 'Panels',
      at: [1, 0],
      behaviour: {
        role: 'converter',
        output: 'electric',
        recipe: { light: 5 },
        capacity: 1,
      },
    },
    {
      id: 'grid',
      kind: 'grid',
      label: 'Grid',
      at: [0, 2],
      behaviour: { role: 'source', output: 10, dispatchable: true },
    },
    {
      id: 'board',
      kind: 'busbar',
      label: 'Consumer unit',
      at: [2, 1],
      behaviour: { role: 'bus' },
    },
    {
      id: 'battery',
      kind: 'battery',
      label: 'Battery',
      at: [2, 2],
      behaviour: {
        role: 'storage',
        capacity: 5,
        start: 0.3,
        maxIn: 2,
        maxOut: 2,
      },
    },
    {
      id: 'home',
      kind: 'house',
      label: 'Home',
      at: [4, 1],
      behaviour: { role: 'sink', demand: '1.2 * home(hour)' },
    },
  ],
  links: [
    { from: 'sun', to: 'pv', domain: 'light' },
    { from: 'pv', to: 'board', domain: 'electric' },
    { from: 'grid', to: 'board', domain: 'electric' },
    { from: 'board', to: 'battery', domain: 'electric' },
    { from: 'battery', to: 'board', domain: 'electric' },
    { from: 'board', to: 'home', domain: 'electric' },
  ],
  expect: [
    {
      says: 'At midday the panels cover the house',
      check: "part('grid').out < 0.05",
      at: 12,
    },
    {
      says: 'In the evening the battery helps out',
      check: "part('battery').out > 0",
      sometime: true,
    },
  ],
}

export const STARTERS: Record<DrawingType, Record<string, unknown>> = {
  pictorial: PICTORIAL,
  pid: PID,
  'single-line': SINGLE_LINE,
  pfd: PFD,
}

/** each practice's house rules, for its MCP prompt and for `new_scene` */
export const PRACTICE: Record<DrawingType, string> = {
  pictorial: [
    'A pictorial sheet explains a system to anyone: each part is drawn as what it is (a turbine, a house, the sun), and the flows between them move.',
    '- Lay the story out left to right: where energy or water comes from, what changes it, where it goes.',
    '- Use `kind` to pick each drawing (see the guide), and give every part a short `note` saying what it does here.',
    '- Write `expect` lines for the claims the subtitle makes, and keep `check_scene` green.',
  ].join('\n'),
  pid: [
    'A P&ID (ISO 10628-2 symbols, ISA-5.1 tags and lines) shows the process equipment, the pipes between it, and the instruments that measure and control it. Power cables and shafts are left off.',
    '- Give every piece of equipment a `tag` (`P-101` pump, `T-101` tank, `V-101` valve, `E-101` exchanger) and a `class` from the P&ID classes in the guide (`CentrifugalPump`, `Tank`, `ControlValve`…).',
    '- Number the process lines with `tag` on the link: size, fluid, sequence, like `100-W-001`.',
    "- Put instruments in `instruments`, one cell above or below the line they serve: a transmitter `measures` the part, a controller `measures` the transmitter and `drives` its control valve. The valve's own `open` signal does the controlling, e.g. `clamp((prev('tank').fill - 0.2) / 0.3, 0, 1)`.",
    '- Process flows left to right on one main row; sources and destinations off the drawing draw as off-page connectors at the ends.',
    '- Fill in `titleBlock` (owner, project, drawn by, issued, revision, status).',
  ].join('\n'),
  'single-line': [
    'A single-line diagram (IEC 60617, or ANSI/IEEE 315 with `"symbols": "ansi"`) shows the electrical network: supplies, transformers, switchgear, busbars and loads, with each three-phase circuit drawn as one line. Pipes and fuel are left off.',
    '- Tag parts with IEC 81346 designations: `-T1` transformer, `-Q1` breaker, `-W1` busbar, `-G1` generator, `-E1` load.',
    '- Every feeder off a busbar goes through its own breaker (`kind` breaker, a gate) before its load.',
    '- Power flows top or left to bottom or right; busbars sit across the middle with feeders leaving one side.',
    '- Standby generation feeds the board through a converter fed by fuel; the fuel store is not drawn but still runs it.',
    '- Fill in `titleBlock`.',
  ].join('\n'),
  pfd: [
    'A process flow diagram (ISO 10628-1) shows the major equipment and the main streams between them, without valves or instruments: the process at a glance.',
    '- Tag the major equipment (`B-101` boiler, `TK-101` tank, `E-101` exchanger) and give each a `class` from the PFD classes in the guide.',
    '- Keep to the main streams left to right; losses leave along `loss` links to a vent.',
    '- Fill in `titleBlock`.',
  ].join('\n'),
}
