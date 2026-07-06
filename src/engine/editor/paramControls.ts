// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { CORE_PAYLOADS } from '../types/taxonomy'

/**
 * Maps an AnimationSpec `exposedParams` JSON-path to a UI control. The L1
 * inspector renders whatever controls a spec exposes — no per-verb UI code.
 */
export type ParamControl =
  | { path: string; kind: 'slider'; label: string; min: number; max: number; step: number; unit?: string }
  | { path: string; kind: 'select'; label: string; options: { value: string; label: string }[] }
  | { path: string; kind: 'color'; label: string; tokens: { token: string; label: string }[] }
  | { path: string; kind: 'sprite'; label: string; options: string[] }

const PAYLOAD_COLOR_TOKENS = [
  'file',
  'record',
  'packet',
  'event',
  'request',
  'response',
  'message',
  'blob',
].map((p) => ({ token: `var(--payload-${p})`, label: p }))

export function controlFor(path: string): ParamControl | null {
  if (path.endsWith('payload.sprite'))
    return { path, kind: 'sprite', label: 'Payload', options: [...CORE_PAYLOADS] }
  if (path.endsWith('payload.colorToken'))
    return { path, kind: 'color', label: 'Colour', tokens: PAYLOAD_COLOR_TOKENS }
  if (path.endsWith('emission.rate'))
    return { path, kind: 'slider', label: 'Rate', min: 0.2, max: 6, step: 0.1, unit: '/s' }
  if (path.endsWith('emission.mode'))
    return {
      path,
      kind: 'select',
      label: 'Emission',
      options: [
        { value: 'continuous', label: 'continuous' },
        { value: 'burst', label: 'burst' },
        { value: 'single', label: 'single' },
      ],
    }
  if (path.endsWith('onArrive'))
    return {
      path,
      kind: 'select',
      label: 'On arrive',
      options: [
        { value: 'increment', label: 'fill (increment)' },
        { value: 'decrement', label: 'drain (decrement)' },
        { value: 'none', label: 'none' },
      ],
    }
  if (path.endsWith('amount'))
    return { path, kind: 'slider', label: 'Amount', min: 0.02, max: 0.3, step: 0.01 }
  if (path.endsWith('durationMs'))
    return { path, kind: 'slider', label: 'Duration', min: 300, max: 4000, step: 100, unit: 'ms' }
  return null
}
