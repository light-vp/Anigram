// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { SCENES, findScene } from '../src/scenes/index.ts'
import { expect, sceneLink, sheetOf, test } from './fixtures.ts'

test('every built-in sheet opens from its tab', async ({ page }) => {
  await page.goto('./?scene=grid')
  const tabs = page.getByRole('navigation', { name: 'Sheets' })
  for (const s of SCENES) {
    await tabs.getByRole('button', { name: s.title }).click()
    await expect(sheetOf(page)).toHaveAttribute(
      'aria-label',
      `${s.title}: ${s.subtitle}`,
    )
    await expect(page).toHaveURL(new RegExp(`scene=${s.id}`))
    await expect(page).toHaveTitle(`${s.title} · Anigram`)
  }
})

test('the clock runs, and pauses', async ({ page }) => {
  await page.goto('./?scene=solar-home&t=9&speed=4')
  const pause = page.getByRole('button', { name: 'Pause' })
  await expect(pause).toBeVisible()
  const clock = sheetOf(page)
  const before = await clock.textContent()
  await expect.poll(() => clock.textContent()).not.toBe(before)
  await pause.click()
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
})

test('paper mode and the dark sheet', async ({ page }) => {
  await page.goto('./?scene=grid')
  const mode = page.getByRole('group', { name: 'Mode' })
  await mode.getByRole('button', { name: 'paper' }).click()
  await expect(mode.getByRole('button', { name: 'paper' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const colour = page.getByRole('group', { name: 'Sheet colour' })
  await colour.getByRole('button', { name: 'dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('clicking a part shows what it is doing', async ({ page }) => {
  await page.goto('./?scene=water-tower&t=12')
  await sheetOf(page).locator('g.part').first().click()
  await expect(page.getByRole('region', { name: /details$/ })).toBeVisible()
})

test('the sheet downloads as svg and as its scene file', async ({ page }) => {
  await page.goto('./?scene=hydro-dam&t=12')
  const [svg] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '↓ svg' }).click(),
  ])
  expect(svg.suggestedFilename()).toMatch(/^hydro-dam-\d{4}\.svg$/)
  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '↓ json' }).click(),
  ])
  expect(json.suggestedFilename()).toMatch(/\.json$/)
})

test('a #scene= link opens the scene it carries', async ({ page }) => {
  const scene = {
    ...SCENES.find((s) => s.id === 'grid')!,
    id: 'shared-grid',
    title: 'A shared grid',
  }
  await page.goto(await sceneLink(scene))
  await expect(sheetOf(page)).toHaveAttribute(
    'aria-label',
    new RegExp('^A shared grid: '),
  )
})

test('a damaged #scene= link says so rather than failing', async ({ page }) => {
  await page.goto('./#scene=not-a-real-scene')
  await expect(page.getByRole('alert')).toContainText('damaged')
  // and the built-in sheet is still there to use
  await expect(sheetOf(page)).toBeVisible()
})

test('an old cloud-era scene id still resolves', async ({ page }) => {
  await page.goto('./?scene=cdn')
  await expect(sheetOf(page)).toHaveAttribute(
    'aria-label',
    new RegExp(`^${findScene('cdn').title}:`),
  )
})

test('✎ edit opens the sheet in the editor', async ({ page }) => {
  await page.goto('./?scene=grid')
  await page.getByRole('button', { name: '✎ edit' }).click()
  await expect(page.getByRole('menubar', { name: 'Editor' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Sheet title' })).toHaveValue(
    SCENES.find((s) => s.id === 'grid')!.title,
  )
})
