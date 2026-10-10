// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { BuildSpec } from './spec.ts'
import { GRID, blank } from './spec.ts'

/** small sheets to start from — each one already runs */
export const STARTERS: Array<{ id: string; label: string; spec: BuildSpec }> = [
  {
    id: 'solar',
    label: 'A solar house',
    spec: {
      v: 1,
      title: 'A solar house',
      size: GRID,
      parts: [
        { id: 'sun', kind: 'sun', at: [0, 0] },
        { id: 'pv', kind: 'pv', at: [1, 0] },
        { id: 'board', kind: 'busbar', at: [3, 1], label: 'Fuse box' },
        { id: 'grid', kind: 'grid', at: [5, 1], label: 'The grid' },
        { id: 'battery', kind: 'battery', at: [3, 3] },
        { id: 'house', kind: 'house', at: [1, 1], label: 'Lights & kettle' },
        { id: 'car', kind: 'car', at: [1, 3] },
        { id: 'hp', kind: 'heatpump', at: [5, 3] },
        { id: 'air', kind: 'air', at: [6, 3] },
        { id: 'rads', kind: 'radiator', at: [5, 4] },
      ],
      links: [
        { from: 'sun', to: 'pv', domain: 'light' },
        { from: 'pv', to: 'board', domain: 'electric' },
        { from: 'board', to: 'house', domain: 'electric' },
        { from: 'board', to: 'battery', domain: 'electric' },
        { from: 'battery', to: 'board', domain: 'electric' },
        { from: 'board', to: 'grid', domain: 'electric' },
        { from: 'grid', to: 'board', domain: 'electric' },
        { from: 'board', to: 'car', domain: 'electric' },
        { from: 'board', to: 'hp', domain: 'electric' },
        { from: 'air', to: 'hp', domain: 'heat' },
        { from: 'hp', to: 'rads', domain: 'heat' },
      ],
    },
  },
  {
    id: 'island',
    label: 'An island grid',
    spec: {
      v: 1,
      title: 'An island grid',
      size: GRID,
      parts: [
        { id: 'wind', kind: 'wind', at: [3, 0], size: 14 },
        { id: 'gas', kind: 'gaswell', at: [0, 2] },
        { id: 'gen', kind: 'gasplant', at: [1, 2], label: 'Diesel set' },
        { id: 'bus', kind: 'busbar', at: [3, 2], label: 'Island busbar' },
        { id: 'battery', kind: 'battery', at: [3, 4], size: 40 },
        { id: 'clinic', kind: 'hospital', at: [1, 4], label: 'Clinic' },
        { id: 'breaker', kind: 'breaker', at: [5, 2] },
        { id: 'feeder', kind: 'busbar', at: [6, 2], label: 'Village feeder' },
        { id: 'homes', kind: 'house', at: [7, 1], label: 'Homes', size: 9 },
        { id: 'mill', kind: 'factory', at: [7, 3], label: 'Mill' },
      ],
      links: [
        { from: 'wind', to: 'bus', domain: 'electric' },
        { from: 'gas', to: 'gen', domain: 'fuel' },
        { from: 'gen', to: 'bus', domain: 'electric' },
        { from: 'bus', to: 'battery', domain: 'electric' },
        { from: 'battery', to: 'bus', domain: 'electric' },
        { from: 'bus', to: 'clinic', domain: 'electric' },
        { from: 'bus', to: 'breaker', domain: 'electric' },
        { from: 'breaker', to: 'feeder', domain: 'electric' },
        { from: 'feeder', to: 'homes', domain: 'electric' },
        { from: 'feeder', to: 'mill', domain: 'electric' },
      ],
    },
  },
  {
    id: 'water',
    label: 'A water tower',
    spec: {
      v: 1,
      title: 'A village’s water',
      size: GRID,
      parts: [
        { id: 'mains', kind: 'grid', at: [1, 0], label: 'Electricity' },
        { id: 'well', kind: 'well', at: [0, 2] },
        { id: 'pump', kind: 'pump', at: [1, 2] },
        { id: 'tower', kind: 'watertower', at: [3, 2] },
        { id: 'valve', kind: 'valve', at: [5, 2], label: 'Main valve' },
        { id: 'taps', kind: 'tap', at: [7, 2], label: 'Village taps' },
      ],
      links: [
        { from: 'mains', to: 'pump', domain: 'electric' },
        { from: 'well', to: 'pump', domain: 'water' },
        { from: 'pump', to: 'tower', domain: 'water' },
        { from: 'tower', to: 'valve', domain: 'water' },
        { from: 'valve', to: 'taps', domain: 'water' },
      ],
    },
  },
  { id: 'blank', label: 'A blank sheet', spec: blank() },
]
