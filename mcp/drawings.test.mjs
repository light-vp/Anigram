// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// Golden drawings: every built-in sheet rendered to SVG at two hours, and
// the engineering reference sheets in examples/,
// committed in test/drawings/. A change that moves a line on a built-in
// sheet fails here, so the pictorial look can't shift while other drawing
// types are added. When the change is meant, `npm run drawings:update`
// rewrites the files and the diff goes in the PR for review.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const server = fileURLToPath(new URL('./dist/anigram-mcp.mjs', import.meta.url))
const DIR = new URL('../test/drawings/', import.meta.url)
const UPDATE = process.env.UPDATE_DRAWINGS === '1'
const client = new Client({ name: 'drawings', version: '0' })

before(() =>
  client.connect(
    new StdioClientTransport({ command: process.execPath, args: [server] }),
  ),
)
after(() => client.close())

/**
 * React's generated ids (clip paths, gradients) depend on the shape of the
 * component tree, not on what is drawn; number them in order of appearance
 */
function normalise(svg) {
  const ids = new Map()
  return svg.replace(/\b(clip|grad|mask)R[0-9a-zA-Z]+/g, (m, kind) => {
    if (!ids.has(m)) ids.set(m, `${kind}${ids.size}`)
    return ids.get(m)
  })
}

const svg = async (args) => {
  const r = await client.callTool({
    name: 'render_scene',
    arguments: { format: 'svg', ...args },
  })
  assert.ok(!r.isError, r.content[0]?.text)
  return r.content.find((c) => c.type === 'text').text
}

test('every built-in sheet draws as it did', async () => {
  const list = await client.callTool({ name: 'list_scenes', arguments: {} })
  const ids = list.structuredContent.scenes.map((s) => s.id)
  assert.ok(ids.length >= 5)
  const changed = []
  for (const id of ids)
    for (const hour of [6, 19]) {
      const name = `${id}-${hour}.svg`
      const file = new URL(name, DIR)
      const drawn = await svg({ id, hour })
      if (UPDATE || !existsSync(file)) {
        mkdirSync(DIR, { recursive: true })
        writeFileSync(file, drawn)
        if (!UPDATE) changed.push(`${name} (was missing, now written)`)
        continue
      }
      if (normalise(readFileSync(file, 'utf8')) !== normalise(drawn))
        changed.push(name)
    }
  // and the engineering reference sheets, which carry instruments and a title block
  for (const example of ['feed-tank-pid', 'hydraulic-press']) {
    const name = `${example}-9.svg`
    const file = new URL(name, DIR)
    const scene = readFileSync(
      new URL(`../examples/${example}.json`, import.meta.url),
      'utf8',
    )
    const drawn = await svg({ scene, hour: 9 })
    if (UPDATE || !existsSync(file)) {
      writeFileSync(file, drawn)
      if (!UPDATE) changed.push(`${name} (was missing, now written)`)
    } else if (normalise(readFileSync(file, 'utf8')) !== normalise(drawn))
      changed.push(name)
  }
  assert.deepEqual(
    changed,
    [],
    'these drawings changed. If that is intended, run `npm run drawings:update` and commit test/drawings/.',
  )
})
