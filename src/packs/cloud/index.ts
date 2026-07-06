// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The flagship "cloud" pack. Everything here is DATA + assets consumed by the
 * engine through registerPack(). No engine logic lives here; no domain logic
 * lives in the engine.
 *
 * M1: node kinds + icons. Verbs, resolver rules, animation presets, payload
 * sprites, and scenes are added in M2/M3/M6.
 */

import type { Pack } from '../../engine'
import { cloudIcons } from './iconRegistry'
import { cloudKinds } from './kinds'
import { cloudResolverRules } from './resolverRules'
import { cloudVerbs } from './verbs'

export const cloudPack: Pack = {
  id: 'cloud',
  name: 'Cloud Architecture',
  version: '0.1.0',
  nodeKinds: cloudKinds,
  icons: cloudIcons,
  verbs: cloudVerbs,
  resolverRules: cloudResolverRules,
  animationPresets: [],
  payloadSprites: [],
  scenes: [],
  meta: {
    license: 'AGPL-3.0-only OR Commercial',
    trademarkNotice:
      'Original artwork. Not affiliated with or endorsed by AWS, Google, or Microsoft.',
  },
}

export { cloudKinds } from './kinds'
export { cloudIcons } from './iconRegistry'
