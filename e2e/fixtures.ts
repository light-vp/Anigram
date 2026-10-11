// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { readFileSync } from 'node:fs'

import { test as base, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { encodeScene } from '../src/format/share.ts'

/*
 * What every browser test shares: a page that fails the test on any console
 * error or uncaught exception, the sheet font pinned for screenshots, and
 * share links built the way the app builds them.
 */

const font = (file: string) =>
  readFileSync(new URL(`../mcp/fonts/${file}`, import.meta.url)).toString(
    'base64',
  )

/**
 * The sheet asks for Inter and falls back to the system's sans, which differs
 * between machines. The MCP server bundles Inter for its PNG renderer; the
 * screenshots load the same files, so a sheet looks the same wherever it is
 * compared.
 */
const PINNED_FONT = [
  ['Inter-Regular.ttf', 400],
  ['Inter-Medium.ttf', 500],
  ['Inter-SemiBold.ttf', 600],
]
  .map(
    ([file, weight]) =>
      `@font-face { font-family: Inter; font-weight: ${weight}; src: url(data:font/ttf;base64,${font(String(file))}) format('truetype'); }`,
  )
  .join('\n')

export async function pinFont(page: Page) {
  await page.addStyleTag({ content: PINNED_FONT })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

/** the running sheet: the drawing itself, as an image with the scene's title */
export const sheetOf = (page: Page): Locator =>
  page.locator('svg[role="img"]').first()

/** a link that carries a whole scene file after #scene= */
export async function sceneLink(scene: unknown, query = '') {
  return `./${query}#scene=${await encodeScene(scene)}`
}

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await use(errors)
      expect(errors, 'the page logged errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
