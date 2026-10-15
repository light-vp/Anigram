// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Scene } from '../sim/types.ts'

/*
 * The event chain's own sheet: a small solar garden where each step sets off
 * the next. Every link of the chain is a real condition on the simulated
 * flows, not a script, so cloud the sky and the whole machine runs late.
 */
export const gardenMachine: Scene = {
  id: 'garden-machine',
  title: 'A garden that waters itself',
  subtitle:
    'Cause and effect, one link at a time: sunlight starts a pump, a float stops it, a timer opens the sprinkler',
  sheet: 'LD-006',
  size: [7, 4],
  units: {
    light: { rate: 'kW', amount: 'kWh' },
    electric: { rate: 'kW', amount: 'kWh' },
    water: { rate: 'm³/h', amount: 'm³', effort: 'bar' },
  },
  scale: { light: 8, electric: 2, water: 4 },
  clock: { start: 5, rate: 0.8 },
  knobs: [
    {
      id: 'cloud',
      label: 'cloud',
      value: 0,
      min: 0,
      max: 1,
      step: 0.05,
      format: '{pct}%',
    },
  ],
  switches: [
    { id: 'pump', label: 'pump running', on: false },
    { id: 'sprinkler', label: 'sprinkler valve open', on: false },
    { id: 'lights', label: 'house lights on', on: false },
  ],
  parts: [
    {
      id: 'sun',
      kind: 'sun',
      label: 'Sun',
      at: [0, 1],
      behaviour: {
        role: 'source',
        output: "8 * sun(hour) * (1 - 0.8 * knob('cloud'))",
      },
      note: 'Sunlight on the shed roof. Drag the cloud slider and watch the whole chain wait for it.',
    },
    {
      id: 'pv',
      kind: 'pv',
      label: 'Solar panel',
      at: [1, 1],
      behaviour: {
        role: 'converter',
        output: 'electric',
        recipe: { light: 5 },
        capacity: 1.6,
      },
      note: 'A fifth of the light becomes electricity. It is also the chain’s alarm clock.',
    },
    {
      id: 'board',
      kind: 'busbar',
      label: 'Shed board',
      at: [2, 1],
      behaviour: { role: 'bus' },
    },
    {
      id: 'house',
      kind: 'house',
      label: 'House lights',
      at: [4, 0],
      toggles: 'lights',
      behaviour: {
        role: 'sink',
        demand: "on('lights') ? 0.3 : 0",
        priority: 1,
      },
      note: 'Dusk turns them on: the last link of the chain.',
    },
    {
      id: 'well',
      kind: 'well',
      label: 'Well',
      at: [3, 3],
      labelSide: 'right',
      behaviour: { role: 'source', output: 10 },
    },
    {
      id: 'pump',
      kind: 'pump',
      label: 'Pump',
      at: [3, 2],
      labelSide: 'left',
      toggles: 'pump',
      behaviour: {
        role: 'converter',
        output: 'water',
        recipe: { electric: 0.3, water: 1 },
        capacity: 3,
      },
      // a small pump: 2.5 bar shut in, falling as it delivers more
      effort: {
        boost: "on('pump') ? 2.5 - 1.2 * pow(part('pump').out / 3, 2) : 0",
        max: 2.6,
      },
      note: 'Only runs on sunshine, and only when the chain says so.',
    },
    {
      id: 'tank',
      kind: 'watertower',
      label: 'Header tank',
      at: [4, 2],
      labelSide: 'below',
      behaviour: {
        role: 'storage',
        capacity: 4,
        start: 0.1,
        maxIn: "on('pump') ? 3 : 0",
        maxOut: 6,
      },
      // four metres up: 0.4 bar empty, 0.6 full
      effort: { set: "0.4 + 0.2 * part('tank').fill" },
      note: 'Four metres up, so the sprinkler gets its pressure from height. A float watches the level.',
    },
    {
      id: 'battery',
      kind: 'battery',
      label: 'Battery',
      at: [2, 0],
      labelSide: 'right',
      behaviour: {
        role: 'storage',
        capacity: 3,
        start: 0.2,
        maxIn: 1.2,
        maxOut: 1,
        efficiency: 0.92,
      },
      note: 'Fills with whatever the pump doesn’t use, for the lights after dark.',
    },
    {
      id: 'valve',
      kind: 'valve',
      label: 'Timer valve',
      at: [5, 2],
      labelSide: 'below',
      toggles: 'sprinkler',
      behaviour: {
        role: 'gate',
        capacity: 4,
        open: "on('sprinkler') ? 1 : 0",
      },
      effort: { drop: 0.1 },
    },
    {
      id: 'sprinkler',
      kind: 'tap',
      label: 'Sprinkler',
      at: [6, 2],
      labelSide: 'below',
      behaviour: { role: 'sink', demand: "on('sprinkler') ? 3.5 : 0" },
      effort: { min: 0.3 },
      note: 'Needs a third of a bar to throw its spray.',
    },
  ],
  links: [
    { from: 'sun', to: 'pv', domain: 'light' },
    { from: 'pv', to: 'board', domain: 'electric' },
    { from: 'board', to: 'battery', domain: 'electric' },
    { from: 'battery', to: 'board', domain: 'electric' },
    {
      from: 'board',
      to: 'house',
      domain: 'electric',
      via: [[4, 1]],
    },
    {
      from: 'board',
      to: 'pump',
      domain: 'electric',
      // in from above, so the pump's words on its left stay clear of it
      via: [
        [2, 1.5],
        [3, 1.5],
      ],
    },
    { from: 'well', to: 'pump', domain: 'water', bend: 'vh' },
    { from: 'pump', to: 'tank', domain: 'water' },
    { from: 'tank', to: 'valve', domain: 'water' },
    {
      from: 'valve',
      to: 'sprinkler',
      domain: 'water',
      capacity: 4,
      drop: 0.08,
    },
  ],
  events: [
    {
      id: 'dawn',
      says: 'Sunlight on the panel starts the pump.',
      when: "part('pv').out > 0.6 && part('tank').fill < 0.5",
      then: [{ switch: 'pump', on: true }],
      at: 'pv',
    },
    {
      id: 'full',
      says: 'The tank fills, and its float stops the pump.',
      when: "part('tank').fill > 0.95",
      then: [{ switch: 'pump', on: false }],
      at: 'tank',
    },
    {
      id: 'timer',
      says: 'Half an hour later, the timer opens the sprinkler.',
      when: "fired('full')",
      after: 0.5,
      then: [{ switch: 'sprinkler', on: true }],
      at: 'valve',
    },
    {
      id: 'empty',
      says: 'The tank runs low: the valve shuts and the pump starts again.',
      when: "part('tank').fill < 0.1 && on('sprinkler')",
      then: [
        { switch: 'sprinkler', on: false },
        { switch: 'pump', on: true },
      ],
      at: 'sprinkler',
    },
    {
      id: 'dusk',
      says: 'Dusk: the battery lights the house.',
      when: 'hour > 12 && sun(hour) < 0.05',
      then: [
        { switch: 'lights', on: true },
        { switch: 'pump', on: false },
      ],
      at: 'house',
    },
  ],
  captions: [
    {
      from: 0,
      to: 6,
      text: 'Night. The house runs on the battery; the garden waits for the sun.',
    },
    {
      from: 6,
      to: 9,
      text: 'Morning. Everything waits on the first link: enough sun on the panel.',
    },
    {
      from: 9,
      to: 19,
      text: 'Pump, float, timer, sprinkler, and round again while the sun lasts.',
    },
    {
      from: 19,
      to: 24,
      text: 'Evening. Cloud the sky and replay the day: every link waits for the sun.',
    },
  ],
  expect: [
    {
      says: 'by mid-morning the sun has started the pump',
      check: "part('pump').out > 0",
      from: 7,
      to: 10,
      sometime: true,
    },
    {
      says: 'the sprinkler runs in the afternoon, on tank pressure',
      check: "part('sprinkler').in > 0 && part('sprinkler').effort > 0.3",
      from: 10,
      to: 18,
      sometime: true,
    },
    {
      says: 'the lights come on after dusk, from the battery',
      check: "part('house').in > 0 && part('battery').out > 0",
      at: 21,
    },
    {
      says: 'the pump never runs in the dark',
      check: "part('pump').out == 0",
      from: 22,
      to: 4,
    },
  ],
}
