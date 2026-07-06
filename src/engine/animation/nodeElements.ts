// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Imperative bridge between React-rendered nodes and the animation scheduler.
 * LDNode registers its fill element + root element here on mount; the scheduler
 * writes fill heights and transient fx classes DIRECTLY to these elements, so
 * level/reaction updates never go through React state (no re-renders).
 */

const fills = new Map<string, HTMLElement>()
const roots = new Map<string, HTMLElement>()

export function registerNodeFill(id: string, el: HTMLElement | null): void {
  if (el) fills.set(id, el)
  else fills.delete(id)
}

export function getNodeFill(id: string): HTMLElement | undefined {
  return fills.get(id)
}

export function registerNodeRoot(id: string, el: HTMLElement | null): void {
  if (el) roots.set(id, el)
  else roots.delete(id)
}

export function getNodeRoot(id: string): HTMLElement | undefined {
  return roots.get(id)
}
