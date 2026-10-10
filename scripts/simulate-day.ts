// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// Run a scene headless through a day and print what every part did, hour by
// hour. For tuning scenes:
//   node scripts/simulate-day.ts grid             a built-in sheet
//   node scripts/simulate-day.ts my-scene.json    a scene file
//   node scripts/simulate-day.ts grid lake,hydro  just these parts
import { readFileSync } from 'node:fs'

import { reportTable, simulateDay } from '../src/format/report.ts'
import { validateScene } from '../src/format/validate.ts'
import { findScene } from '../src/scenes/index.ts'

const arg = process.argv[2] ?? ''
let scene = findScene(arg)
if (arg.endsWith('.json')) {
  const v = validateScene(JSON.parse(readFileSync(arg, 'utf8')))
  for (const w of v.warnings) console.warn(`warning  ${w}`)
  if (!v.scene) {
    for (const e of v.errors) console.error(`error    ${e}`)
    process.exit(1)
  }
  scene = v.scene
}
const report = simulateDay(scene)
console.log(
  reportTable(
    scene,
    report,
    (process.argv[3] ?? '').split(',').filter(Boolean),
  ),
)
console.log(
  'alerts during the day:',
  report.alerts
    .map((a) => `${a.text} (${a.hours.map((h) => `${h}:00`).join(', ')})`)
    .join('; ') || 'none',
)
