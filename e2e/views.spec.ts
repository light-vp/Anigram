// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { findScene } from '../src/scenes/index.ts'
import { expect, sheetOf, test } from './fixtures.ts'

test('?embed=1 is the sheet and a play bar, with no app chrome', async ({
  page,
}) => {
  await page.goto('./?embed=1&scene=solar-home')
  await expect(sheetOf(page)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^(Play|Pause)$/ }),
  ).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Sheets' })).toHaveCount(0)
})

test('the portfolio embed (?embed=presentation) still works', async ({
  page,
}) => {
  await page.goto('./?embed=presentation&scene=oauth2')
  await expect(sheetOf(page)).toHaveAttribute(
    'aria-label',
    new RegExp(`^${findScene('oauth2').title}:`),
  )
})

test('an embedded part shows its note when clicked', async ({ page }) => {
  await page.goto('./?embed=1&scene=water-tower&mode=paper&t=12')
  await sheetOf(page).locator('g.part').first().click()
  // the part's note; the clock is a live region too
  await expect(page.locator('div[role="status"]')).toBeVisible()
})

test('the credit line is on by default and off with ?credit=0', async ({
  page,
}) => {
  await page.goto('./?embed=1&scene=grid&mode=paper')
  await expect(sheetOf(page).locator('text.credit')).toHaveText(
    /Made with Anigram/,
  )
  await page.goto('./?embed=1&scene=grid&mode=paper&credit=0')
  await expect(sheetOf(page)).toBeVisible()
  await expect(sheetOf(page).locator('text.credit')).toHaveCount(0)
})

test('?screen=1 is dark and full bleed', async ({ page }) => {
  await page.goto('./?screen=1&scene=hydro-dam')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(sheetOf(page)).toBeVisible()
  const box = await sheetOf(page).boundingBox()
  const size = page.viewportSize()!
  // full bleed: the sheet fills one dimension of the screen
  expect(
    Math.max(box!.width / size.width, box!.height / size.height),
  ).toBeGreaterThan(0.85)
})

test('reduced motion holds the sheet still', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('./?embed=1&scene=grid&t=10')
  const sheet = sheetOf(page)
  await expect(sheet).toBeVisible()
  const first = await sheet.textContent()
  await page.waitForTimeout(1500)
  expect(await sheet.textContent()).toBe(first)
  await context.close()
})
