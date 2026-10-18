// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { renderToStaticMarkup } from 'react-dom/server'

import { frameAt } from '../format/report.ts'
import type { Controls } from '../format/report.ts'
import type { Scene } from '../sim/types.ts'
import { sheetSize } from './geometry.ts'
import type { ThemeId } from './palette.ts'
import { Sheet } from './Sheet.tsx'

export interface RenderOptions extends Controls {
  /** hour of day to draw, 0–24; defaults to the scene's opening hour */
  hour?: number
  theme?: ThemeId
  /** label every flow with its value and direction, as paper mode does (default true) */
  annotate?: boolean
  /** sign the sheet "Made with Anigram · Vaibhav Patel" (default true) */
  credit?: boolean
  /** a static drawing: no clock or readings, an engineering drawing at rest */
  plain?: boolean
}

/**
 * The sheet as a standalone SVG file, rendered in node — no browser. The
 * scene is run from its opening hour to `hour` first, so tanks and batteries
 * show the level they would really have reached. The same component draws
 * the live app, so the file matches what the browser shows in paper mode.
 */
export function renderSheetSvg(scene: Scene, opts: RenderOptions = {}): string {
  const hour = opts.hour ?? scene.clock.start
  const frame = frameAt(scene, hour, opts)
  const { w, h } = sheetSize(scene)
  const markup = renderToStaticMarkup(
    <Sheet
      scene={scene}
      frame={frame}
      theme={opts.theme ?? 'light'}
      annotate={opts.annotate ?? true}
      animate={false}
      selected={null}
      credit={opts.credit ?? true}
      plain={opts.plain ?? false}
    />,
  ).replace('<svg ', `<svg width="${w}" height="${h}" `)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`
}
