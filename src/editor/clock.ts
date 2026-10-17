// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/** the editor's clock, carried across a remount of the sheet */
export interface Clock {
  hour: number
  day: number
  speed: number
  playing: boolean
}

/** where the clock is kept while the sheet remounts under an edit */
export interface ClockKeeper {
  get(): Clock
  set(clock: Clock): void
}

export function keepClock(): ClockKeeper {
  let clock: Clock = { hour: 6, day: 0, speed: 1, playing: true }
  return {
    get: () => clock,
    set: (next) => {
      clock = next
    },
  }
}
