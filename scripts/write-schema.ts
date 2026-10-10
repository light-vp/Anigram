// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// Writes the scene format's JSON Schema to schema/. Run after changing the format.

import { mkdirSync, writeFileSync } from 'node:fs'

import { FORMAT_VERSION } from '../src/format/migrate.ts'
import { sceneSchema } from '../src/format/schema.ts'

const dir = new URL('../schema/', import.meta.url)
mkdirSync(dir, { recursive: true })
const file = new URL(`scene.v${FORMAT_VERSION}.json`, dir)
writeFileSync(file, `${JSON.stringify(sceneSchema(), null, 2)}\n`)
console.log(`wrote ${file.pathname}`)
