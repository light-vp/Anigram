// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'

import { STARTERS } from '../src/packs/starters.ts'
import { SCENES, findScene } from '../src/scenes/index.ts'
import { expect, pinFont, sceneLink, sheetOf, test } from './fixtures.ts'

/*
 * Every sheet as the browser draws it, frozen at noon on paper, compared
 * with e2e/screenshots/. The MCP golden drawings pin the SVG the server
 * writes; these pin what a person sees: the app's CSS, the fonts, the
 * engineering symbols as Chromium paints them. When a change to a drawing is
 * meant, a commit with [update screenshots] in its message has CI re-record
 * them, and the diff goes in the PR for review.
 */

const example = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>

/** one scene, several drawings: built-in sheets drawn the engineering way too */
const asDrawing = (id: string, drawing: string) => ({
  ...findScene(id),
  drawing,
})

const SHEETS: Array<{ name: string; scene: unknown }> = [
  ...Object.entries(STARTERS).map(([drawing, scene]) => ({
    name: `starter-${drawing}`,
    scene,
  })),
  { name: 'example-feed-tank-pid', scene: example('feed-tank-pid') },
  { name: 'example-narrowboat', scene: example('narrowboat') },
  { name: 'grid-single-line', scene: asDrawing('grid', 'single-line') },
  { name: 'water-tower-pid', scene: asDrawing('water-tower', 'pid') },
]

const shoot = (page: Page, name: string) =>
  expect(sheetOf(page)).toHaveScreenshot(name)

for (const theme of ['light', 'dark'] as const)
  for (const s of SCENES)
    test(`${s.id}, ${theme}`, async ({ page }) => {
      await page.goto(`./?embed=1&scene=${s.id}&mode=paper&t=12&theme=${theme}`)
      await pinFont(page)
      await shoot(page, `${s.id}-${theme}.png`)
    })

for (const { name, scene } of SHEETS)
  test(name, async ({ page }) => {
    await page.goto(await sceneLink(scene, '?embed=1&mode=paper&t=12'))
    await pinFont(page)
    await expect(sheetOf(page)).toHaveAttribute(
      'aria-label',
      new RegExp(
        `^${String((scene as { title: string }).title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      ),
    )
    await shoot(page, `${name}.png`)
  })
