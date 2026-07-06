// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Generic payload sprite glyphs (16x16 viewBox). These are engine built-ins —
 * "a file" or "a packet" is domain-agnostic. Packs may override via
 * payloadSprites later. Filled shapes inherit fill=currentColor; arrow glyphs
 * set their own stroke.
 */

const DEFAULT_GLYPH = '<circle cx="8" cy="8" r="4.5"/>'

export const PAYLOAD_GLYPHS: Record<string, string> = {
  file: '<rect x="3.5" y="1.5" width="9" height="13" rx="1.6"/>',
  record: '<rect x="1.5" y="5" width="13" height="6" rx="1.5"/>',
  packet: '<circle cx="8" cy="8" r="5"/>',
  request:
    '<path d="M2.5 8h8M7.5 4.5l4 3.5-4 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  response:
    '<path d="M13.5 8h-8M8.5 4.5l-4 3.5 4 3.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  event: '<path d="M8 1.8 10 6 14.2 8 10 10 8 14.2 6 10 1.8 8 6 6Z"/>',
  message: '<rect x="2" y="4" width="12" height="8" rx="1.5"/>',
  blob: '<circle cx="8" cy="8" r="6"/>',
  token: '<circle cx="6" cy="8" r="3.4"/><rect x="8.5" y="7" width="6" height="2" rx="1"/>',
  frame: '<rect x="2" y="3.5" width="12" height="9" rx="1.5"/>',
}

export function glyphFor(payload: string): string {
  return PAYLOAD_GLYPHS[payload] ?? DEFAULT_GLYPH
}

/** Default colour token per payload (used when a spec doesn't pin one). */
export function payloadColorToken(payload: string): string {
  return `var(--payload-${payload}, var(--edge-pulse))`
}
