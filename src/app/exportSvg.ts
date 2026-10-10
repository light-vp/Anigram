// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

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
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.svg`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
