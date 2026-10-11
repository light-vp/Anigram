// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { defineConfig, devices } from '@playwright/test'

/*
 * Browser tests: the app as people meet it, built and served the way it is
 * deployed. `npm run build` first; `npm run e2e` serves dist/ and drives it.
 * Screenshots of the sheets live in e2e/screenshots/ and are compared with
 * the sheet font pinned (see e2e/fonts.ts), so they hold across machines.
 * `npm run e2e:update` rewrites them when a change to a drawing is meant.
 */

const PORT = 4179

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/results',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' },
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
})
