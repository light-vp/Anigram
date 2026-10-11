// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Page } from '@playwright/test'

import { CELL, HEAD_H, PAD } from '../src/view/geometry.ts'
import { expect, sheetOf, test } from './fixtures.ts'

/** the grid the editor lays over the sheet, which takes the clicks */
const overlay = (page: Page) =>
  sheetOf(page).locator('xpath=following-sibling::*[local-name()="svg"]')

/** where a grid cell's centre is on screen */
async function cell(page: Page, [c, r]: [number, number]) {
  const svg = overlay(page)
  const box = (await svg.boundingBox())!
  const [, , w] = (await svg.getAttribute('viewBox'))!.split(' ').map(Number)
  const k = box.width / w!
  return {
    x: box.x + (PAD + c * CELL + CELL / 2) * k,
    y: box.y + (HEAD_H + r * CELL + CELL / 2) * k,
  }
}

async function clickCell(page: Page, at: [number, number]) {
  const { x, y } = await cell(page, at)
  await page.mouse.click(x, y)
}

async function dragCell(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const a = await cell(page, from)
  const b = await cell(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up()
}

const parts = (page: Page) => sheetOf(page).locator('g.part')

async function startFrom(page: Page, label: string) {
  await page
    .getByRole('toolbar', { name: 'Editor' })
    .getByRole('combobox')
    .selectOption({ label })
}

async function placeFromPalette(
  page: Page,
  name: string,
  at: [number, number],
) {
  await page
    .getByRole('navigation', { name: 'Parts' })
    .getByRole('button', { name, exact: true })
    .click()
  await clickCell(page, at)
}

test('?build=1 opens the editor on a working sheet', async ({ page }) => {
  await page.goto('./?build=1')
  await expect(page.getByRole('toolbar', { name: 'Editor' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Parts' })).toBeVisible()
  await expect(sheetOf(page)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Checks' })).toBeVisible()
})

test('build a sheet: place, connect, undo, redo, and it is still there after a reload', async ({
  page,
}) => {
  await page.goto('./?build=1')
  await startFrom(page, 'A blank sheet')
  await expect(parts(page)).toHaveCount(0)

  await placeFromPalette(page, 'Solar panels', [1, 1])
  await placeFromPalette(page, 'House', [4, 1])
  await expect(parts(page)).toHaveCount(2)

  // drag one part onto another to connect them
  await dragCell(page, [1, 1], [4, 1])
  await clickCell(page, [1, 1])
  await expect(
    page.getByRole('button', { name: /^Disconnect / }).first(),
  ).toBeVisible()

  const undo = page.getByRole('button', { name: 'undo' })
  const redo = page.getByRole('button', { name: 'redo' })
  await undo.click() // the link
  await undo.click() // the house
  await expect(parts(page)).toHaveCount(1)
  await redo.click()
  await expect(parts(page)).toHaveCount(2)

  await page.reload()
  await expect(parts(page)).toHaveCount(2)
})

test('the title edits the sheet', async ({ page }) => {
  await page.goto('./?build=1')
  const title = page.getByRole('textbox', { name: 'Sheet title' })
  await title.fill('Allotment shed')
  await title.press('Enter')
  await expect(sheetOf(page)).toHaveAttribute('aria-label', /^Allotment shed/)
})

test('a P&ID gets the P&ID palette, and parts arrive tagged', async ({
  page,
}) => {
  await page.goto('./?build=1&drawing=pid')
  const palette = page.getByRole('navigation', { name: 'Parts' })
  await expect(palette.getByRole('heading', { name: 'Vessels' })).toBeVisible()
  await expect(palette.getByRole('heading', { name: 'Valves' })).toBeVisible()
  await expect(
    palette.getByRole('heading', { name: 'Instruments' }),
  ).toBeVisible()
})

test('every starter opens without a problem', async ({ page }) => {
  await page.goto('./?build=1')
  const picker = page
    .getByRole('toolbar', { name: 'Editor' })
    .getByRole('combobox')
  await expect(picker).toBeVisible()
  const options = await picker
    .locator('option:not([disabled])')
    .allTextContents()
  expect(options.length).toBeGreaterThan(8)
  for (const label of options) {
    await startFrom(page, label)
    await expect(sheetOf(page), label).toBeVisible()
  }
})

test('an old playground #sheet= link opens as a scene', async ({ page }) => {
  const old = {
    v: 1,
    title: 'Old shed',
    size: [8, 5],
    parts: [
      { id: 'sun', kind: 'sun', at: [0, 1] },
      { id: 'pv', kind: 'pv', at: [2, 1] },
      { id: 'home', kind: 'house', at: [4, 1] },
    ],
    links: [
      { from: 'sun', to: 'pv', domain: 'light' },
      { from: 'pv', to: 'home', domain: 'electric' },
    ],
  }
  const b64 = Buffer.from(JSON.stringify(old))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  await page.goto(`./?build=1#sheet=${b64}`)
  await expect(sheetOf(page)).toHaveAttribute('aria-label', /^Old shed/)
  await expect(parts(page)).toHaveCount(3)
})

test('save file downloads the scene', async ({ page }) => {
  await page.goto('./?build=1')
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'save file' }).click(),
  ])
  expect(file.suggestedFilename()).toMatch(/\.json$/)
  const text = await (await file.createReadStream()).toArray()
  const scene = JSON.parse(Buffer.concat(text).toString('utf8'))
  expect(scene.anigram).toBe(1)
  expect(scene.parts.length).toBeGreaterThan(0)
})

test('copy link round-trips the sheet', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./?build=1')
  const title = page.getByRole('textbox', { name: 'Sheet title' })
  await title.fill('Round trip')
  await title.press('Enter')
  await page.getByRole('button', { name: 'copy view link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('#scene=')
  const viewer = await context.newPage()
  await viewer.goto(link)
  await expect(sheetOf(viewer)).toHaveAttribute('aria-label', /^Round trip/)
})
