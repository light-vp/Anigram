// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * A whole scene in a URL: JSON, deflated, base64url, after `#scene=`. The
 * hash never reaches a server, so a shared drawing stays between the people
 * holding the link, and the app needs no backend to open one. Works the same
 * in the browser and in node (both have CompressionStream).
 */

export const HASH_KEY = 'scene'

async function pipe(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
) {
  const out = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** a scene object → the text that goes after `#scene=` */
export async function encodeScene(scene: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(scene))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

/** the text after `#scene=` → the parsed JSON (still to be validated) */
export async function decodeScene(text: string): Promise<unknown> {
  const bytes = await pipe(
    fromBase64Url(text),
    new DecompressionStream('deflate-raw'),
  )
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** the encoded scene in a location hash, if there is one */
export function sceneFromHash(hash: string): string | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  return q.get(HASH_KEY)
}
