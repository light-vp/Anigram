// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * @living-diagrams/engine — the domain-agnostic core.
 *
 * BOUNDARY: nothing under src/engine/ may import from src/packs/ or src/app/.
 * Packs supply domain knowledge as data via registerPack(). Enforced by the
 * oxlint override in .oxlintrc.json.
 */

export * from './types'
export * from './registry/packRegistry'
export * from './resolver/resolveInteraction'
export * from './store/useDiagramStore'
export * from './canvas/DiagramCanvas'
export * from './canvas/LDNode'
export * from './canvas/LDEdge'
export * from './editor/Palette'
export { cx } from './lib/cx'
