// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { glyphFor } from './payloadGlyphs'
import type { PayloadRenderer, Sprite } from './types'

/**
 * SVG/DOM payload renderer. Maintains a pool of absolutely-positioned sprite
 * elements and updates them imperatively each frame — no React involved. Behind
 * the PayloadRenderer interface so a Canvas/WebGL renderer can replace it at
 * scale without touching the scheduler.
 */
export class SvgPayloadRenderer implements PayloadRenderer {
  private container: HTMLElement | null = null
  private pool: HTMLDivElement[] = []

  mount(container: HTMLElement): void {
    this.container = container
  }

  private makeSprite(): HTMLDivElement {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.left = '0'
    el.style.top = '0'
    el.style.pointerEvents = 'none'
    el.style.willChange = 'transform, opacity'
    el.style.display = 'none'
    this.container?.appendChild(el)
    return el
  }

  render(sprites: Sprite[]): void {
    if (!this.container) return
    while (this.pool.length < sprites.length) this.pool.push(this.makeSprite())

    sprites.forEach((s, i) => {
      const el = this.pool[i]
      if (!el) return
      const key = `${s.payload}|${s.size}`
      if (el.dataset.key !== key) {
        el.innerHTML = `<svg width="${s.size}" height="${s.size}" viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true">${glyphFor(s.payload)}</svg>`
        el.dataset.key = key
      }
      el.style.color = s.colorToken
      el.style.opacity = s.opacity.toFixed(3)
      el.style.transform = `translate(${(s.x - s.size / 2).toFixed(2)}px, ${(s.y - s.size / 2).toFixed(2)}px)`
      el.style.display = 'block'
    })

    for (let i = sprites.length; i < this.pool.length; i++) {
      const el = this.pool[i]
      if (el) el.style.display = 'none'
    }
  }

  clear(): void {
    for (const el of this.pool) el.style.display = 'none'
  }

  destroy(): void {
    for (const el of this.pool) el.remove()
    this.pool = []
    this.container = null
  }
}
