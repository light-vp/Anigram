// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * "Did you mean…?" for names a person or an assistant got slightly wrong:
 * a field, a part kind, a knob id. Close means within a couple of edits
 * (an insertion, a deletion, a swap or a changed letter), scaled to length.
 */

/** edit distance, counting a swap of neighbours as one edit */
export function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)),
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
    }
  return d[a.length]![b.length]!
}

/** the closest option, if any is close enough to be what was meant */
export function closest(
  word: string,
  options: Iterable<string>,
): string | undefined {
  const w = word.toLowerCase()
  const limit = Math.max(1, Math.min(3, Math.floor(w.length / 3)))
  let best: string | undefined
  let bestD = Infinity
  for (const o of options) {
    const d = distance(w, o.toLowerCase())
    if (d < bestD) {
      best = o
      bestD = d
    }
  }
  return bestD <= limit ? best : undefined
}

/** ` — did you mean "x"?`, or nothing */
export function didYouMean(word: string, options: Iterable<string>): string {
  const c = closest(word, options)
  return c === undefined ? '' : ` — did you mean "${c}"?`
}
