// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { MCP_INSTALL } from '../src/site/links.ts'
import { expect, sheetOf, test } from './fixtures.ts'

test('the home page is the editor', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('toolbar', { name: 'Editor' })).toBeVisible()
  await expect(sheetOf(page)).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Anigram' })
  await expect(nav.getByRole('link', { name: 'Editor' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('the header goes to the examples, the docs and the MCP server', async ({
  page,
}) => {
  await page.goto('./')
  const nav = page.getByRole('navigation', { name: 'Anigram' })
  await nav.getByRole('link', { name: 'Examples' }).click()
  await expect(page.getByRole('navigation', { name: 'Sheets' })).toBeVisible()
  await expect(sheetOf(page)).toBeVisible()

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
  await expect(page.getByRole('toolbar', { name: 'Editor' })).toBeVisible()
})

test('a view link still shows the sheet running', async ({ page }) => {
  await page.goto('./?scene=water-tower')
  await expect(page.getByRole('navigation', { name: 'Sheets' })).toBeVisible()
  await expect(page.getByRole('toolbar', { name: 'Editor' })).toHaveCount(0)
})
