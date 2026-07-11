// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { LDEdge, LDNode } from './store/useDiagramStore'
import { useDiagramStore } from './store/useDiagramStore'
import type { Interaction } from './types/interaction'

/**
 * Versioned diagram document. The `version` field is the joint Phase-2's
 * Terraform/IaC importer will emit into — so import/export and code-generation
 * share one shape.
 */
export interface DiagramDoc {
  version: 1
  nodes: LDNode[]
  edges: LDEdge[]
  interactions: Record<string, Interaction>
}

const STORAGE_KEY = 'anigram:doc'
/** pre-rename key — migrated forward on first load so saved diagrams survive */
const LEGACY_STORAGE_KEY = 'living-diagrams:doc'

export function serializeDiagram(): DiagramDoc {
  const { nodes, edges, interactions } = useDiagramStore.getState()
  return { version: 1, nodes, edges, interactions }
}

export function applyDiagramDoc(doc: unknown): boolean {
  if (
    !doc ||
    typeof doc !== 'object' ||
    (doc as DiagramDoc).version !== 1 ||
    !Array.isArray((doc as DiagramDoc).nodes) ||
    !Array.isArray((doc as DiagramDoc).edges)
  ) {
    return false
  }
  const d = doc as DiagramDoc
  useDiagramStore.setState({
    nodes: d.nodes,
    edges: d.edges,
    interactions: d.interactions ?? {},
    selectedNodeId: null,
    selectedEdgeId: null,
  })
  return true
}

export function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeDiagram()))
  } catch {
    return
  }
}

function readStoredDoc(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) return raw
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!legacy) return null
  localStorage.setItem(STORAGE_KEY, legacy)
  localStorage.removeItem(LEGACY_STORAGE_KEY)
  return legacy
}

export function loadFromStorage(): boolean {
  try {
    const raw = readStoredDoc()
    if (!raw) return false
    return applyDiagramDoc(JSON.parse(raw))
  } catch {
    return false
  }
}

let autosaveTimer: ReturnType<typeof setTimeout> | undefined

export function startAutosave(delayMs = 400): void {
  useDiagramStore.subscribe(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(saveToStorage, delayMs)
  })
}

export function exportDiagramJson(): string {
  return JSON.stringify(serializeDiagram(), null, 2)
}

export function importDiagramJson(text: string): boolean {
  try {
    return applyDiagramDoc(JSON.parse(text))
  } catch {
    return false
  }
}
