// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Page } from '@playwright/test'

import { EXAMPLES } from '../src/site/gallery.ts'
import { MCP_INSTALL, REPO_URL, SUPPORT_URL } from '../src/site/links.ts'
import { expect, sheetOf, test } from './fixtures.ts'

const help = async (page: Page, item: string) => {
  await page
    .getByRole('menubar', { name: 'Editor' })
    .getByRole('menuitem', { name: 'Help', exact: true })
    .click()
  await page
    .getByRole('menu', { name: 'Help' })
    .getByRole('menuitem', { name: item })
    .click()
}

test('the home page is the editor', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('menubar', { name: 'Editor' })).toBeVisible()
  await expect(sheetOf(page)).toBeVisible()
})

test('Help goes to the docs and the MCP server, and has GitHub and support', async ({
  page,
}) => {
  await page.goto('./')
  await page
    .getByRole('menubar', { name: 'Editor' })
    .getByRole('menuitem', { name: 'Help', exact: true })
    .click()
  const menu = page.getByRole('menu', { name: 'Help' })
  await expect(menu.getByRole('menuitem', { name: 'GitHub' })).toHaveAttribute(
    'href',
    REPO_URL,
  )
  await expect(
    menu.getByRole('menuitem', { name: 'Support Anigram' }),
  ).toHaveAttribute('href', SUPPORT_URL)
  await menu.getByRole('menuitem', { name: 'How the editor works' }).click()
  await expect(
    page.getByRole('dialog', { name: 'How the editor works' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await help(page, 'MCP server')
  await expect(page).toHaveURL(/\?docs#mcp$/)
  await expect(
    page.getByRole('heading', { name: 'MCP server' }),
  ).toBeInViewport()
})

test('the site header goes to the examples, the docs and the editor', async ({
  page,
}) => {
  await page.goto('./?docs')
  const nav = page.getByRole('navigation', { name: 'Anigram' })
  await nav.getByRole('link', { name: 'Examples' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Examples' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Examples · Anigram')

  await nav.getByRole('link', { name: 'Docs' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Anigram docs' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Docs · Anigram')

  await nav.getByRole('link', { name: 'MCP' }).click()
  await expect(page).toHaveURL(/\?docs#mcp$/)
  await expect(
    page.getByRole('heading', { name: 'MCP server' }),
  ).toBeInViewport()
  await expect(page.getByText(MCP_INSTALL, { exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Editor' }).click()
  await expect(page.getByRole('menubar', { name: 'Editor' })).toBeVisible()
})

test('the evaluation shows every scenario drawn both ways', async ({
  page,
}) => {
  await page.goto('./?docs#evaluation')
  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(31)
  await page.getByRole('button', { name: 'Change a DEXPI file' }).click()
  await expect(cards).toHaveCount(4)
  const first = cards.first()
  await expect(first.getByRole('img')).toHaveCount(2)
  await first
    .getByRole('button', { name: /compare the two drawings/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('img')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a view link still shows the sheet running', async ({ page }) => {
  await page.goto('./?scene=water-tower')
  await expect(page.getByRole('navigation', { name: 'Sheets' })).toBeVisible()
  await expect(page.getByRole('menubar', { name: 'Editor' })).toHaveCount(0)
})

test('the examples gallery runs, shows and edits every sheet', async ({
  page,
}) => {
  await page.goto('./?examples')
  const cards = page.getByRole('listitem')
  await expect(cards).toHaveCount(EXAMPLES.length)
  // every sheet is drawn once it scrolls into view
  await cards.last().scrollIntoViewIfNeeded()
  await expect(page.locator('main svg[role="img"]')).toHaveCount(
    EXAMPLES.length,
  )

  const kinds = page.getByRole('group', { name: 'Kind of drawing' })
  await kinds.getByRole('button', { name: 'P&ID' }).click()
  const pids = EXAMPLES.filter((e) => e.scene.drawing === 'pid')
  await expect(cards).toHaveCount(pids.length)

  // a sheet from examples/ rides whole in its link
  const card = cards.filter({ hasText: 'House rainwater harvesting' })
  await card.getByRole('link', { name: 'Static', exact: true }).click()
  await expect(page).toHaveURL(/\?mode=static#scene=/)
  await expect(sheetOf(page)).toHaveAttribute(
    'aria-label',
    /^House rainwater harvesting/,
  )

  await page.goBack()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The power grid' })
    .getByRole('link', { name: 'Edit', exact: true })
    .click()
  await expect(page).toHaveURL(/\?build=1&scene=grid$/)
  await expect(page.getByRole('menubar', { name: 'Editor' })).toBeVisible()
})
