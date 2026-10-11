// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Undo and redo over whole files. Each edit is a new file, so a step back is
 * just the one before; typing into a field replaces the newest step rather
 * than stacking one per keystroke.
 */

export interface History<T> {
  past: T[]
  now: T
  future: T[]
}

/** how many steps back undo can reach */
export const DEPTH = 80

export const start = <T>(now: T): History<T> => ({ past: [], now, future: [] })

/** a new step; `merge` folds it into the current one instead */
export function push<T>(h: History<T>, next: T, merge = false): History<T> {
  if (next === h.now) return h
  if (merge) return { ...h, now: next, future: [] }
  return { past: [...h.past, h.now].slice(-DEPTH), now: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h
  return {
    past: h.past.slice(0, -1),
    now: h.past[h.past.length - 1]!,
    future: [h.now, ...h.future],
  }
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h
  return {
    past: [...h.past, h.now],
    now: h.future[0]!,
    future: h.future.slice(1),
  }
}
