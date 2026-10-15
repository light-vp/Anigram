// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { readFileSync } from 'node:fs'

import { expect, test } from './fixtures.ts'

test('the storyboard tells the day, and records it as a GIF', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('./?scene=garden-machine')
  await page.getByRole('button', { name: '▤ storyboard' }).click()
  const dialog = page.getByRole('dialog', { name: 'Storyboard' })
  const board = dialog.getByRole('img', { name: /a storyboard of 8 moments/ })
  await expect(board).toBeVisible()
  await expect
    .poll(() => board.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)

  const [svg] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: '↓ storyboard' }).click(),
  ])
  expect(svg.suggestedFilename()).toBe('garden-machine-storyboard.svg')
  const markup = readFileSync((await svg.path())!, 'utf8')
  expect(markup).toContain('Half an hour later, the timer opens the sprinkler.')

  const [gif] = await Promise.all([
    page.waitForEvent('download', { timeout: 110_000 }),
    dialog.getByRole('button', { name: '↓ gif' }).click(),
  ])
  expect(gif.suggestedFilename()).toBe('garden-machine.gif')
  const bytes = readFileSync((await gif.path())!)
  expect(bytes.subarray(0, 6).toString()).toBe('GIF89a')

  await dialog.getByRole('button', { name: 'close' }).click()
  await expect(dialog).toBeHidden()
})

test('the editor opens the storyboard of the sheet being drawn', async ({
  page,
}) => {
  await page.goto('./?build=1&scene=water-tower')
  await page.getByRole('button', { name: 'storyboard', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Storyboard' })
      .getByRole('img', { name: /A town’s water: a storyboard/ }),
  ).toBeVisible()
})
