// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { stamp } from '../format/migrate.ts'
import type { Scene } from '../sim/types.ts'

/**
 * Save the sheet exactly as it is on screen. The SVG already carries its own
 * stylesheet and palette, so the file opens the same in a browser, Figma or
 * Illustrator, and prints at any size.
 */
export function downloadSvg(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const [, , w, h] = (svg.getAttribute('viewBox') ?? '0 0 1000 700').split(' ')
  clone.setAttribute('width', `${w}`)
  clone.setAttribute('height', `${h}`)
  clone.setAttribute('class', 'sheet')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
  save(new Blob([xml], { type: 'image/svg+xml' }), `${name}.svg`)
}

/** the scene file itself — the same JSON the MCP server and `npm run simulate` read */
export function downloadJson(scene: Scene) {
  const json = `${JSON.stringify(stamp(scene), null, 2)}\n`
  save(new Blob([json], { type: 'application/json' }), `${scene.id}.json`)
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
