// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The sheet as a PNG, so an assistant can look at what it drew. resvg runs
 * as wasm (no browser, no native build), with Inter bundled because a wasm
 * renderer has no system fonts to fall back on. The wasm and the fonts are
 * copied next to the built server (see vite.config.ts) and loaded on the
 * first PNG, so the other tools never pay for them.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { initWasm, Resvg } from '@resvg/resvg-wasm'

/** the files the built server reads from its own folder */
export const PNG_ASSETS = {
  wasm: 'resvg.wasm',
  fonts: ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf'],
}

const here = () => dirname(fileURLToPath(import.meta.url))

let fonts: Uint8Array[] | undefined

function ready(): Uint8Array[] {
  return (fonts ??= PNG_ASSETS.fonts.map((f) => readFileSync(join(here(), f))))
}

let wasm: Promise<void> | undefined

/**
 * resvg reads `<style>` but not CSS custom properties, and the sheet's
 * colours are all `var(--x)` set on the root element, so they are written
 * in place first.
 */
export function flattenVars(svg: string): string {
  const vars = new Map<string, string>()
  for (const [, name, value] of svg.matchAll(/--([\w-]+)\s*:\s*([^;"]+)/g))
    if (name && value && !vars.has(name)) vars.set(name, value.trim())
  return svg.replace(
    /var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/g,
    (_, name: string, fallback?: string) =>
      vars.get(name) ?? fallback?.trim() ?? 'currentColor',
  )
}

/** render an SVG string to PNG bytes, `width` pixels wide */
export async function svgToPng(
  svg: string,
  width: number,
): Promise<Uint8Array> {
  wasm ??= initWasm(readFileSync(join(here(), PNG_ASSETS.wasm)))
  await wasm
  const r = new Resvg(flattenVars(svg), {
    fitTo: { mode: 'width', value: Math.round(width) },
    font: {
      fontBuffers: ready(),
      defaultFontFamily: 'Inter',
      sansSerifFamily: 'Inter',
      loadSystemFonts: false,
    },
  })
  try {
    const image = r.render()
    try {
      return image.asPng()
    } finally {
      image.free()
    }
  } finally {
    r.free()
  }
}
