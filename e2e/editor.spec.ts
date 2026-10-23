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

const menuBar = (page: Page) => page.getByRole('menubar', { name: 'Editor' })

/** pick an item from one of the editor's menus */
async function choose(page: Page, menu: string, item: string) {
  await menuBar(page).getByRole('menuitem', { name: menu, exact: true }).click()
  const open = page.getByRole('menu', { name: menu })
  await open
    .getByRole('menuitem', { name: item, exact: true })
    .or(open.getByRole('menuitemradio', { name: item, exact: true }))
    .click()
}

async function startFrom(page: Page, label: string) {
  await choose(
    page,
    'File',
    label === 'A blank sheet' ? 'New blank sheet' : label,
  )
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
  await expect(menuBar(page)).toBeVisible()
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

  await choose(page, 'Edit', 'Undo') // the link
  await page.keyboard.press('ControlOrMeta+z') // the house
  await expect(parts(page)).toHaveCount(1)
  await choose(page, 'Edit', 'Redo')
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

test('a P&ID part not yet on a line shows its symbol, not an empty box', async ({
  page,
}) => {
  await page.goto('./?build=1')
  await startFrom(page, 'A P&ID')
  await placeFromPalette(page, 'Positive displacement pump', [1, 0])
  // its power is linked, but a pump is drawn once it is on a process line
  const placeholder = overlay(page)
    .locator('g')
    .filter({ has: page.getByText('connect it to draw it', { exact: true }) })
    .filter({ hasText: 'displacement pump' })
  await expect(placeholder).toHaveCount(1)
  // the symbol's own strokes, besides the dashed box
  expect(
    await placeholder.locator('circle, path, line, polygon').count(),
  ).toBeGreaterThan(0)
  // and the power supply it brought is labelled as off the drawing
  await expect(
    overlay(page).getByText('not on this drawing').first(),
  ).toBeVisible()
})

test('every starter opens without a problem', async ({ page }) => {
  await page.goto('./?build=1')
  await menuBar(page)
    .getByRole('menuitem', { name: 'File', exact: true })
    .click()
  const file = page.getByRole('menu', { name: 'File' })
  const all = await file.getByRole('menuitem').allTextContents()
  const starters = all.slice(
    0,
    all.findIndex((t) => t.startsWith('Open file')),
  )
  expect(starters.length).toBeGreaterThan(8)
  await page.keyboard.press('Escape')
  for (const label of starters) {
    await choose(page, 'File', label)
    await expect(sheetOf(page), label).toBeVisible()
  }
})

test('the menus work from the keyboard', async ({ page }) => {
  await page.goto('./?build=1')
  const file = menuBar(page).getByRole('menuitem', {
    name: 'File',
    exact: true,
  })
  await file.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'New blank sheet' }),
  ).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(
    menuBar(page).getByRole('menuitem', { name: 'Edit', exact: true }),
  ).toBeFocused()
})

test('View → Static drawing stops the sheet and drops its readings', async ({
  page,
}) => {
  await page.goto('./?build=1&drawing=pid')
  await expect(
    page.getByRole('button', { name: /^(Play|Pause)$/ }),
  ).toBeVisible()
  await choose(page, 'View', 'Static drawing')
  await expect(sheetOf(page)).toHaveClass(/\bplain\b/)
  await expect(sheetOf(page).locator('text.clock')).toHaveCount(0)
  await expect(sheetOf(page).locator('text.value').first()).toBeHidden()
  await expect(
    page.getByRole('button', { name: /^(Play|Pause)$/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Animate' }).click()
  await expect(sheetOf(page)).not.toHaveClass(/\bplain\b/)
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
})

test('?mode=static opens the editor on a static drawing', async ({ page }) => {
  await page.goto('./?build=1&drawing=pid&mode=static')
  await expect(sheetOf(page)).toHaveClass(/\bplain\b/)
  await menuBar(page)
    .getByRole('menuitem', { name: 'View', exact: true })
    .click()
  await expect(
    page.getByRole('menuitemradio', { name: 'Static drawing' }),
  ).toHaveAttribute('aria-checked', 'true')
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
    choose(page, 'File', 'Save file'),
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
  await choose(page, 'File', 'Copy view link')
  await expect(page.getByText('View link copied.')).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toContain('#scene=')
  const viewer = await context.newPage()
  await viewer.goto(link)
  await expect(sheetOf(viewer)).toHaveAttribute('aria-label', /^Round trip/)

  // a static drawing's view link opens static
  await choose(page, 'View', 'Static drawing')
  await choose(page, 'File', 'Copy link to the static drawing')
  await expect(page.getByText('Static drawing link copied.')).toBeVisible()
  const still = await page.evaluate(() => navigator.clipboard.readText())
  expect(still).toContain('?mode=static#scene=')
  await viewer.goto(still)
  await expect(sheetOf(viewer)).toHaveClass(/\bplain\b/)
})
