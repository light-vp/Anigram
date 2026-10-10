// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import * as G from './glyphs.tsx'
import type { Glyph } from './glyphs.tsx'

export type { Glyph, GlyphProps } from './glyphs.tsx'

/** kind id → glyph. A scene names its parts' kinds from this list. */
export const GLYPHS: Record<string, Glyph> = {
  // sources
  sun: G.Sun,
  wind: G.Wind,
  pv: G.SolarPanel,
  gaswell: G.GasWell,
  core: G.Core,
  grid: G.Grid,
  rain: G.Rain,
  air: G.Air,
  // conversion
  transformer: G.Transformer,
  inverter: G.Inverter,
  turbine: G.Turbine,
  generator: G.Generator,
  turbogen: G.TurboGen,
  gasplant: G.GasPlant,
  pump: G.Pump,
  heatpump: G.HeatPump,
  servers: G.Servers,
  // carriers and switchgear
  busbar: G.Busbar,
  manifold: G.Manifold,
  breaker: G.Breaker,
  valve: G.Valve,
  pylon: G.Pylon,
  // storage
  battery: G.Battery,
  reservoir: G.Reservoir,
  watertower: G.WaterTower,
  hottank: G.HotTank,
  fueltank: G.FuelTank,
  // water
  well: G.Well,
  treatment: G.Treatment,
  tap: G.Tap,
  hydrant: G.Hydrant,
  river: G.River,
  weir: G.Weir,
  // demand
  house: G.House,
  city: G.City,
  hospital: G.Hospital,
  factory: G.Factory,
  radiator: G.Radiator,
  car: G.Car,
  globe: G.Globe,
  // where waste goes
  coolingtower: G.CoolingTower,
  sky: G.Sky,
  fan: G.Fan,
}

/** junctions drawn as a bare bar rather than set in a tile */
export const BAR_KINDS = new Set(['busbar', 'manifold'])

export function glyphFor(kind: string): Glyph {
  return GLYPHS[kind] ?? G.Generic
}
