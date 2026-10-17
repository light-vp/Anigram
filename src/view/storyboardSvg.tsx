// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { renderToStaticMarkup } from 'react-dom/server'

import { simulationWith } from '../format/report.ts'
import type { Controls } from '../format/report.ts'
import type { Storyboard } from '../format/storyboard.ts'
import { frameCaption } from '../sim/captions.ts'
import { clockTime } from '../sim/profiles.ts'
import type { Frame } from '../sim/runtime.ts'
import type { Scene } from '../sim/types.ts'
import { CELL, HEAD_H, sheetSize } from './geometry.ts'
import { THEMES } from './palette.ts'
import type { ThemeId } from './palette.ts'
import { CREDIT, Sheet } from './Sheet.tsx'

/*
 * A storyboard as one page, and a recording's frames, as SVG strings: what
 * the MCP server rasterises in node and the app rasterises in the browser.
 * The panels are the sheet itself, cropped to the drawing (the page carries
 * the title once, and each panel its own time), so nothing is redrawn by
 * hand and a panel always matches the live sheet at that moment.
 */

export interface StoryRenderOptions extends Controls {
  theme?: ThemeId
  /** label every flow on the panels, as paper mode does (default false) */
  labels?: boolean
  /** sign the page "Made with Anigram · Vaibhav Patel" (default true) */
  credit?: boolean
}

const FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

export const escapeXml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )

/** words broken into lines of about `chars` characters, at most `max` lines */
export function wrap(text: string, chars: number, max = 4): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > chars) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  if (lines.length > max) {
    lines.length = max
    lines[max - 1] = `${lines[max - 1]!.replace(/[\s,.;:]+$/, '')}…`
  }
  return lines
}

/** the sheet at one frame, as markup with no XML prolog */
function sheetMarkup(
  scene: Scene,
  frame: Frame,
  theme: ThemeId,
  annotate: boolean,
  animate: boolean,
  credit: boolean,
): string {
  return renderToStaticMarkup(
    <Sheet
      scene={scene}
      frame={frame}
      theme={theme}
      annotate={annotate}
      animate={animate}
      selected={null}
      credit={credit}
    />,
  )
}

/** the part of the sheet a panel shows: the drawing, without its header and footer */
function crop(scene: Scene): { x: number; y: number; w: number; h: number } {
  const { w } = sheetSize(scene)
  // room under the last row for its parts' words
  return { x: 0, y: HEAD_H - 8, w, h: scene.size[1] * CELL + 40 }
}

/** place a rendered sheet inside a page, showing `view` of it at `box` */
function nest(
  markup: string,
  view: { x: number; y: number; w: number; h: number },
  box: { x: number; y: number; w: number; h: number },
): string {
  return markup
    .replace(/^<svg ([^>]*?)viewBox="[^"]*"/, '<svg $1')
    .replace(
      /^<svg /,
      `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet" `,
    )
}

/** how many columns a board of `n` panels lays out in */
export function columnsFor(n: number): number {
  if (n <= 3) return n
  if (n === 4) return 2
  return n <= 9 ? 3 : 4
}

/**
 * The board as one SVG page: the scene's title, then the panels in reading
 * order, each the drawing at its moment with its number, its time and what
 * happened.
 */
export function renderStoryboardSvg(
  scene: Scene,
  board: Storyboard,
  opts: StoryRenderOptions = {},
): string {
  const theme = opts.theme ?? 'light'
  const p = THEMES[theme]
  const view = crop(scene)
  const n = board.panels.length
  const cols = Math.max(1, columnsFor(n))
  const rows = Math.ceil(n / cols)
  // everything is sized from the panel, so the page reads the same at any scale
  const pw = view.w
  const ph = view.h
  const unit = pw / 100
  const gap = 5 * unit
  const margin = 6 * unit
  const fs = 2.6 * unit
  const chars = Math.floor(pw / (fs * 0.52))
  // as tall as the wordiest panel needs, and no taller
  const most = Math.max(
    1,
    ...board.panels.map((x) => wrap(x.says, chars).length),
  )
  const textH = fs * 1.45 * most + fs * 2.6
  const headH = 11 * unit
  const footH = opts.credit === false ? margin : 7 * unit
  const W = margin * 2 + cols * pw + (cols - 1) * gap
  const H = margin + headH + rows * (ph + textH) + (rows - 1) * gap + footH

  const sim = simulationWith(scene, opts)
  const parts: string[] = []
  for (const panel of board.panels) {
    sim.seek(panel.hour)
    const i = panel.n - 1
    const x = margin + (i % cols) * (pw + gap)
    const y = margin + headH + Math.floor(i / cols) * (ph + textH + gap)
    const markup = sheetMarkup(
      scene,
      sim.frame,
      theme,
      opts.labels ?? false,
      false,
      false,
    )
    parts.push(
      `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${unit * 1.4}" fill="${p.paper}" stroke="${p.line}" stroke-width="${unit * 0.15}"/>`,
      nest(markup, view, { x, y, w: pw, h: ph }),
    )
    const ty = y + ph + fs * 1.9
    parts.push(
      `<text x="${x}" y="${ty}" font-size="${fs}" fill="${p.muted}" font-weight="500">${panel.n}<tspan dx="${fs * 0.8}">${clockTime(panel.hour)}</tspan></text>`,
    )
    wrap(panel.says, chars).forEach((line, k) =>
      parts.push(
        `<text x="${x}" y="${ty + fs * 1.45 * (k + 1)}" font-size="${fs}" fill="${p.ink}">${escapeXml(line)}</text>`,
      ),
    )
  }

  const title = `<text x="${margin}" y="${margin + 4.2 * unit}" font-size="${4.2 * unit}" font-weight="600" fill="${p.ink}">${escapeXml(scene.title)}</text>`
  const sub = `<text x="${margin}" y="${margin + 8.2 * unit}" font-size="${2.4 * unit}" fill="${p.muted}">${escapeXml(`${scene.sheet} · storyboard · ${n} ${n === 1 ? 'moment' : 'moments'}`)}</text>`
  const credit =
    opts.credit === false
      ? ''
      : `<text x="${margin}" y="${H - margin * 0.7}" font-size="${2 * unit}" fill="${p.muted}">${escapeXml(CREDIT)}</text>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${W} ${H}" font-family="${FONT}"><rect width="${W}" height="${H}" fill="${p.paper}"/>${title}${sub}${parts.join('')}${credit}</svg>`
}

export interface FrameRenderOptions {
  theme?: ThemeId
  /** label every flow (default false: a moving picture reads without numbers) */
  labels?: boolean
  credit?: boolean
  /** how far through the recording, 0–1, drawn as a hairline under the caption */
  progress?: number
  /** the words under the frame (default the scene's own caption at that moment) */
  caption?: string
  /** how far the sheet has dipped to paper, 0–1, for a cut between two moments */
  fade?: number
}

/** the band under a recorded frame: its caption and a progress hairline */
export const BAND_H = 64

/** the size of a recorded frame, in sheet units */
export function frameSize(scene: Scene): { w: number; h: number } {
  const { w, h } = sheetSize(scene)
  return { w, h: h + BAND_H }
}

/**
 * One frame of a recording: the whole sheet, moving, with what is happening
 * written underneath, as an event chain's own caption does in the app.
 */
export function renderFrameSvg(
  scene: Scene,
  frame: Frame,
  opts: FrameRenderOptions = {},
): string {
  const theme = opts.theme ?? 'light'
  const p = THEMES[theme]
  const { w, h } = sheetSize(scene)
  const markup = sheetMarkup(
    scene,
    frame,
    theme,
    opts.labels ?? false,
    true,
    opts.credit ?? true,
  )
  const caption = opts.caption ?? frameCaption(scene, frame) ?? ''
  const fs = 17
  const lines = wrap(caption, Math.floor((w - 80) / (fs * 0.5)), 2)
  const text = lines
    .map(
      (line, k) =>
        `<text x="40" y="${h + 26 + k * 22}" font-size="${fs}" fill="${p.ink}">${escapeXml(line)}</text>`,
    )
    .join('')
  const progress =
    opts.progress === undefined
      ? ''
      : `<rect x="40" y="${h + 2}" width="${w - 80}" height="2" fill="${p.line}"/><rect x="40" y="${h + 2}" width="${(w - 80) * Math.max(0, Math.min(1, opts.progress))}" height="2" fill="${p.muted}"/>`
  const fade = Math.max(0, Math.min(1, opts.fade ?? 0))
  const dip = fade
    ? `<rect width="${w}" height="${h}" fill="${p.paper}" opacity="${Math.round(fade * 1000) / 1000}"/>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + BAND_H}" viewBox="0 0 ${w} ${h + BAND_H}" font-family="${FONT}"><rect width="${w}" height="${h + BAND_H}" fill="${p.paper}"/>${nest(markup, { x: 0, y: 0, w, h }, { x: 0, y: 0, w, h })}${dip}${progress}${text}</svg>`
}
