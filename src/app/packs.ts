// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Pack wiring lives in the APP, not the engine — the app is allowed to import
 * both. This is where domain packs are registered into the engine registry.
 */

import { registerPack } from '../engine'
import { cloudPack } from '../packs/cloud'

let registered = false

export function registerAllPacks(): void {
  if (registered) return
  registerPack(cloudPack)
  registered = true
}
