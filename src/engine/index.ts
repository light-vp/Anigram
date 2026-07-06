// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * @living-diagrams/engine — the domain-agnostic core.
 *
 * BOUNDARY: nothing under src/engine/ may import from src/packs/ or src/app/.
 * The engine knows about affordances, the resolver mechanism, the AnimationSpec
 * interpreter, the scheduler/renderer, the stores, and the editor — never about
 * buckets, CDNs, or any specific domain. Packs supply that as data via
 * registerPack(). Enforced by the oxlint override in .oxlintrc.json.
 *
 * Populated in M1+.
 */

export {}
