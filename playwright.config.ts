// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { defineConfig, devices } from '@playwright/test'

/*
 * Browser tests: the app as people meet it, built and served the way it is
 * deployed. `npm run build` first; `npm run e2e` serves dist/ and drives it.
 * Screenshots of the sheets live in e2e/screenshots/. They are recorded and
 * compared inside Playwright's own Docker image (CI's `browser` job), where
 * the browser and its font rendering never change; on any other machine,
 * run `npm run e2e -- --ignore-snapshots`. To re-record them when a change
 * to a drawing is meant, push a commit with "[update screenshots]" in its
 * message (see .github/workflows/screenshots.yml).
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
