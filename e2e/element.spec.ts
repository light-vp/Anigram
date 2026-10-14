// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'

import { encodeScene } from '../src/format/share.ts'
import { findScene } from '../src/scenes/index.ts'
import { expect, test } from './fixtures.ts'

/*
 * <living-diagram> on someone else's page. The page is made up here and
 * answered by the test itself, beside the built dist/living-diagram.js, so
 * nothing test-only ships in dist/. Playwright's CSS locators reach into open
 * shadow roots, so `living-diagram#x svg` finds the sheet inside one.
 */

const example = (name: string) =>
  readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8')

const NARROWBOAT = example('narrowboat.json')
const FEED_TANK = example('feed-tank-pid.json')

async function host(page: Page, body: string) {
  await page.route('**/element-test.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>living-diagram test</title>
    <style>
      /* a hostile page: none of this may reach the sheet */
      * { font-family: serif !important; }
      svg { display: none; }
      body { margin: 0; padding: 20px; width: 900px; }
    </style>
    <script>
      window.events = []
      for (const type of ['load', 'error'])
        document.addEventListener(type, (e) => {
          if (e.target.localName === 'living-diagram')
            window.events.push({ type, id: e.target.id, detail: e.detail })
        }, true)
    </script>
    <script type="module" src="./living-diagram.js"></script>
  </head>
  <body>${body}</body>
</html>`,
    }),
  )
  await page.route('**/plant.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: FEED_TANK }),
  )
  await page.goto('./element-test.html')
}

type Seen = { type: string; id: string; detail: Record<string, unknown> }
const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { events: Seen[] }).events)

test('a built-in sheet runs in the shadow root, and its clock moves', async ({
  page,
}) => {
  await host(
    page,
    '<living-diagram id="a" scene="water-tower" hour="9"></living-diagram>',
  )
  const sheet = page.locator('living-diagram#a svg[role="img"]')
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAttribute(
    'aria-label',
    new RegExp(`^${findScene('water-tower').title}:`),
  )
  // the sheet lives in the shadow root, not the page
  expect(
    await page.evaluate(() => ({
      light: document.querySelectorAll('svg').length,
      shadow: !!document
        .querySelector('living-diagram')!
        .shadowRoot!.querySelector('svg.sheet'),
    })),
  ).toEqual({ light: 0, shadow: true })

  const clock = page.locator('living-diagram#a output')
  await expect(clock).toHaveText(/^0?9:/)
  const first = await clock.textContent()
  await expect(clock).not.toHaveText(first!)

  // sized by the sheet: as wide as its container, as tall as its proportions
  const box = (await page.locator('living-diagram#a').boundingBox())!
  expect(box.width).toBe(900)
  expect(box.height).toBeGreaterThan(300)

  expect(await events(page)).toEqual([
    {
      type: 'load',
      id: 'a',
      detail: { id: 'water-tower', title: findScene('water-tower').title },
    },
  ])
})

test('a scene inline, from src and from a share string', async ({ page }) => {
  const share = await encodeScene(JSON.parse(NARROWBOAT))
  await host(
    page,
    `<living-diagram id="inline" controls="false" credit="false">
      <script type="application/json">${NARROWBOAT}</script>
    </living-diagram>
    <living-diagram id="src" src="./plant.json" theme="dark" paused></living-diagram>
    <living-diagram id="share" share="#scene=${share}"></living-diagram>`,
  )
  const boat = JSON.parse(NARROWBOAT) as { title: string }
  const plant = JSON.parse(FEED_TANK) as { title: string }

  const inline = page.locator('living-diagram#inline')
  await expect(inline.locator('svg[role="img"]')).toHaveAttribute(
    'aria-label',
    new RegExp(`^${boat.title}`),
  )
  // controls="false" drops the play bar, credit="false" the credit line
  await expect(
    inline.getByRole('button', { name: /^(Play|Pause)$/ }),
  ).toHaveCount(0)
  await expect(inline.locator('text.credit')).toHaveCount(0)

  const src = page.locator('living-diagram#src')
  await expect(src.locator('svg[role="img"]')).toHaveAttribute(
    'aria-label',
    new RegExp(`^${plant.title}`),
  )
  await expect(src.locator('.ld-root')).toHaveAttribute('data-theme', 'dark')
  // paused: the clock holds, and Play starts it
  const clock = src.locator('output')
  const held = await clock.textContent()
  await page.waitForTimeout(600)
  await expect(clock).toHaveText(held!)
  await src.getByRole('button', { name: 'Play' }).click()
  await expect(clock).not.toHaveText(held!)

  await expect(
    page.locator('living-diagram#share svg[role="img"]'),
  ).toHaveAttribute('aria-label', new RegExp(`^${boat.title}`))

  // attributes change a running sheet in place
  await src.evaluate((el) => el.setAttribute('theme', 'light'))
  await expect(src.locator('.ld-root')).toHaveAttribute('data-theme', 'light')
  await inline.evaluate((el) => el.setAttribute('controls', ''))
  await expect(
    inline.getByRole('button', { name: /^(Play|Pause)$/ }),
  ).toHaveCount(1)

  const loads = (await events(page)).filter((e) => e.type === 'load')
  expect(loads.map((e) => e.id).sort()).toEqual(['inline', 'share', 'src'])
})

test('a bad scene says what is wrong, and fires error', async ({ page }) => {
  await host(
    page,
    `<living-diagram id="bad">
      <script type="application/json">{"anigram": 1, "title": "Broken", "parts": "none"}</script>
    </living-diagram>
    <living-diagram id="unknown" scene="no-such-sheet"></living-diagram>`,
  )
  const bad = page.locator('living-diagram#bad [role="alert"]')
  await expect(bad).toContainText('This diagram can’t be shown')
  await expect(bad.locator('li').first()).toBeVisible()
  await expect(
    page.locator('living-diagram#unknown [role="alert"]'),
  ).toContainText('no built-in sheet "no-such-sheet"')
  await expect(page.locator('living-diagram svg')).toHaveCount(0)

  const seen = await events(page)
  expect(seen.map((e) => `${e.type}:${e.id}`).sort()).toEqual([
    'error:bad',
    'error:unknown',
  ])
  const detail = seen.find((e) => e.id === 'bad')!.detail
  expect((detail.errors as string[]).length).toBeGreaterThan(0)
})

test('taking the element off the page stops it cleanly', async ({ page }) => {
  await host(page, '<living-diagram id="a" scene="grid"></living-diagram>')
  await expect(page.locator('living-diagram#a svg[role="img"]')).toBeVisible()
  const empty = await page.evaluate(async () => {
    const el = document.querySelector('living-diagram')!
    el.remove()
    await new Promise((r) => setTimeout(r, 100))
    return el.shadowRoot!.querySelector('.ld-mount')!.childElementCount
  })
  expect(empty).toBe(0)
  // and back on the page, it starts again
  await page.evaluate(() => {
    const el = document.createElement('living-diagram')
    el.id = 'b'
    el.setAttribute('scene', 'grid')
    document.body.append(el)
  })
  await expect(page.locator('living-diagram#b svg[role="img"]')).toBeVisible()
})
