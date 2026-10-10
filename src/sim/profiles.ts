// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Shapes of a day. Every curve takes an hour (0–24, fractional) and returns
 * a multiplier, roughly 0..1. Deterministic: the same hour always gives the
 * same value, so an embed looks the same for everyone at the same time.
 */

/** a smooth bump centred on `at`, `width` hours either side */
function bump(hour: number, at: number, width: number): number {
  let d = Math.abs(hour - at)
  d = Math.min(d, 24 - d)
  if (d >= width) return 0
  return 0.5 + 0.5 * Math.cos((Math.PI * d) / width)
}

/** sunlight: up at 6, peak at 13, down at 20 */
export function sun(hour: number): number {
  if (hour < 6 || hour > 20) return 0
  return Math.pow(Math.sin((Math.PI * (hour - 6)) / 14), 1.4)
}

/** a home: overnight base, breakfast, an evening peak */
export function home(hour: number): number {
  return (
    0.22 +
    0.45 * bump(hour, 7.5, 2) +
    0.2 * bump(hour, 13, 3) +
    0.75 * bump(hour, 19, 3.5)
  )
}

/** a whole city: smoother than one home, still a 6pm peak */
export function city(hour: number): number {
  return (
    0.55 +
    0.2 * bump(hour, 9, 4) +
    0.15 * bump(hour, 14, 5) +
    0.38 * bump(hour, 18.5, 4)
  )
}

/** a factory: one shift, 7 till 19 */
export function shift(hour: number): number {
  const ramp = (x: number) => Math.min(1, Math.max(0, x))
  return 0.15 + 0.85 * ramp(hour - 6.5) * ramp(19.5 - hour)
}

/** water use: showers in the morning, cooking and baths in the evening */
export function water(hour: number): number {
  return (
    0.12 +
    0.95 * bump(hour, 7, 1.8) +
    0.25 * bump(hour, 12.5, 2.5) +
    0.6 * bump(hour, 19.5, 2.5)
  )
}

/** heating: on early, off while out, on all evening; colder at night */
export function heating(hour: number): number {
  return 0.15 + 0.7 * bump(hour, 6.5, 2) + 0.8 * bump(hour, 20, 4)
}

/** web traffic: quiet before dawn, a lunchtime bump, busiest at 9pm */
export function traffic(hour: number): number {
  return 0.3 + 0.6 * bump(hour, 20.5, 10) + 0.2 * bump(hour, 12.5, 4)
}

/** gusty wind: a few incommensurate waves, always 0.15..1 */
export function wind(hour: number, day = 0): number {
  const t = hour + day * 24
  const v =
    0.55 +
    0.22 * Math.sin(t * 0.61 + 1.3) +
    0.14 * Math.sin(t * 1.73 + 0.4) +
    0.09 * Math.sin(t * 3.1 + 2.2)
  return Math.min(1, Math.max(0.15, v))
}

/** rain on a catchment: a storm in the afternoon */
export function rain(hour: number): number {
  return 0.25 + 0.75 * bump(hour, 15, 5)
}

/** format an hour as HH:MM */
export function clockTime(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
