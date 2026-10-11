// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Doc } from './doc.ts'

/** what the side panel is showing */
export type Selection =
  | { kind: 'part'; id: string }
  | { kind: 'link'; index: number }
  | { kind: 'instrument'; index: number }

/** what a finding's path points at, in the validator's path shapes */
export function selectionOf(path: string, doc: Doc): Selection | null {
  const part = /^parts(?:\[\d+\])? \(([^)]+)\)/.exec(path)
  if (part && doc.parts.some((p) => p.id === part[1]))
    return { kind: 'part', id: part[1]! }
  const link = /^links\[(\d+)\]/.exec(path)
  if (link && doc.links[Number(link[1])])
    return { kind: 'link', index: Number(link[1]) }
  const inst = /^instruments\[(\d+)\]/.exec(path)
  if (inst && doc.instruments?.[Number(inst[1])])
    return { kind: 'instrument', index: Number(inst[1]) }
  return null
}
