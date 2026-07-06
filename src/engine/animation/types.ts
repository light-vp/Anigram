// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/** A payload sprite to paint this frame (flow coordinates). */
export interface Sprite {
  payload: string
  colorToken: string
  size: number
  x: number
  y: number
  opacity: number
}

/**
 * Renders sprites each frame. The SVG implementation ships now; a Canvas/WebGL
 * renderer can be swapped in behind this interface at scale without touching the
 * scheduler or specs.
 */
export interface PayloadRenderer {
  mount(container: HTMLElement): void
  render(sprites: Sprite[]): void
  clear(): void
  destroy(): void
}
