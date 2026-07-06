// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { AnimationSpec } from '../types/animationSpec'
import type { NodeKind } from '../types/node'
import type {
  GlyphComponent,
  Pack,
  ResolverRule,
  Scene,
  ThemeDefinition,
  VerbDef,
} from '../types/pack'

/**
 * The pack registry. Packs merge their data here via registerPack(); the rest of
 * the engine reads through the getters below. This is the engine↔pack boundary
 * and the seam a future marketplace plugs into.
 *
 * State is module-level (a process singleton). registerPack is idempotent so
 * React StrictMode double-invocation and HMR re-registration are safe.
 */

const packs = new Map<string, Pack>()
const nodeKinds = new Map<string, NodeKind>()
const specs = new Map<string, AnimationSpec>()
const verbs = new Map<string, VerbDef>()
const icons = new Map<string, GlyphComponent>()
const sprites = new Map<string, GlyphComponent>()
const themes = new Map<string, ThemeDefinition>()
const scenes = new Map<string, Scene>()
const resolverRules: ResolverRule[] = []

export function registerPack(pack: Pack): void {
  if (packs.has(pack.id)) return
  packs.set(pack.id, pack)

  for (const kind of pack.nodeKinds) nodeKinds.set(kind.id, kind)
  for (const spec of pack.animationPresets ?? []) specs.set(spec.id, spec)
  for (const verb of pack.verbs ?? []) verbs.set(String(verb.verb), verb)
  for (const icon of pack.icons ?? []) icons.set(icon.id, icon.Component)
  for (const sprite of pack.payloadSprites ?? [])
    sprites.set(sprite.id, sprite.Component)
  for (const theme of pack.themes ?? []) themes.set(theme.id, theme)
  for (const scene of pack.scenes ?? []) scenes.set(scene.id, scene)
  if (pack.resolverRules) resolverRules.push(...pack.resolverRules)
}

export function isPackRegistered(id: string): boolean {
  return packs.has(id)
}

/* ---- node kinds ---- */
export function getNodeKinds(): NodeKind[] {
  return [...nodeKinds.values()]
}
export function getNodeKind(id: string): NodeKind | undefined {
  return nodeKinds.get(id)
}

/* ---- animation specs ---- */
export function getSpec(id: string): AnimationSpec | undefined {
  return specs.get(id)
}
export function getSpecs(): AnimationSpec[] {
  return [...specs.values()]
}

/* ---- verbs ---- */
export function getVerbDef(verb: string): VerbDef | undefined {
  return verbs.get(verb)
}

/* ---- glyphs ---- */
export function getIcon(id: string): GlyphComponent | undefined {
  return icons.get(id)
}
export function getSprite(id: string): GlyphComponent | undefined {
  return sprites.get(id)
}

/* ---- resolver rules ---- */
export function getResolverRules(): readonly ResolverRule[] {
  return resolverRules
}

/* ---- themes ---- */
export function getThemes(): ThemeDefinition[] {
  return [...themes.values()]
}
export function getTheme(id: string): ThemeDefinition | undefined {
  return themes.get(id)
}

/* ---- scenes ---- */
export function getScenes(): Scene[] {
  return [...scenes.values()]
}
export function getScene(id: string): Scene | undefined {
  return scenes.get(id)
}

/** Test/HMR helper: wipe all registered data. */
export function resetRegistry(): void {
  packs.clear()
  nodeKinds.clear()
  specs.clear()
  verbs.clear()
  icons.clear()
  sprites.clear()
  themes.clear()
  scenes.clear()
  resolverRules.length = 0
}
