// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// Drives the built server over stdio the way an assistant would:
// `npm run build:mcp && node --test mcp/smoke.test.mjs`
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const server = fileURLToPath(new URL('./dist/anigram-mcp.mjs', import.meta.url))
const cwd = mkdtempSync(join(tmpdir(), 'anigram-mcp-'))
const client = new Client({ name: 'smoke', version: '0' })

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  return { error: !!r.isError, text: r.content[0].text }
}

const kettle = {
  id: 'kettle',
  title: 'A kettle',
  size: [3, 1],
  units: { electric: { rate: 'kW', amount: 'kWh' } },
  scale: { electric: 3 },
  parts: [
    {
      id: 'grid',
      kind: 'grid',
      label: 'Grid',
      at: [0, 0],
      behaviour: { role: 'source', output: 10 },
    },
    {
      id: 'kettle',
      kind: 'house',
      label: 'Kettle',
      at: [2, 0],
      behaviour: { role: 'sink', demand: 'between(hour, 7, 8) ? 3 : 0' },
    },
  ],
  links: [{ from: 'grid', to: 'kettle', domain: 'electric' }],
}

before(async () => {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [server],
      cwd,
    }),
  )
})
after(() => client.close())

test('lists its tools', async () => {
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, [
    'anigram_guide',
    'edit_scene',
    'get_scene',
    'list_scenes',
    'render_scene',
    'share_link',
    'simulate_scene',
    'validate_scene',
    'write_scene',
  ])
})

test('serves the scene format as a JSON Schema', async () => {
  const { contents } = await client.readResource({
    uri: 'anigram://schema/scene',
  })
  const schema = JSON.parse(contents[0].text)
  assert.equal(schema.title, 'Anigram scene')
  assert.equal(schema.properties.anigram.const, 1)
})

test('the guide covers the format, the functions and the parts', async () => {
  const { text } = await call('anigram_guide')
  for (const s of ['## Behaviours', '`sun()`', '`battery`', 'Domains:'])
    assert.ok(text.includes(s), s)
})

test('built-in sheets come back as scene files', async () => {
  const list = JSON.parse((await call('list_scenes')).text)
  assert.equal(list.length, 5)
  const grid = JSON.parse((await call('get_scene', { id: 'grid' })).text)
  assert.equal(grid.sheet, 'LD-001')
  assert.equal(grid.anigram, 1)
})

test('write, edit, simulate, render, share', async () => {
  assert.equal(
    (await call('write_scene', { file: 'kettle.json', scene: kettle })).error,
    false,
  )
  const edited = JSON.parse(
    (
      await call('edit_scene', {
        file: 'kettle.json',
        ops: [
          {
            op: 'add_part',
            part: {
              id: 'toaster',
              kind: 'house',
              label: 'Toaster',
              at: [2, 0.5],
              behaviour: { role: 'sink', demand: 1 },
            },
          },
          {
            op: 'add_link',
            link: { from: 'grid', to: 'toaster', domain: 'electric' },
          },
          { op: 'set', field: 'size', value: [3, 2] },
          { op: 'update_part', id: 'toaster', set: { at: [2, 1] } },
        ],
      })
    ).text,
  )
  assert.equal(edited.ok, true, edited.errors.join('\n'))
  const onDisk = JSON.parse(readFileSync(join(cwd, 'kettle.json'), 'utf8'))
  assert.equal(onDisk.parts.length, 3)
  assert.equal(onDisk.anigram, 1, 'written files carry the format version')

  const sim = await call('simulate_scene', { file: 'kettle.json' })
  assert.equal(sim.error, false, sim.text)
  assert.match(sim.text, /every demand was met/)

  const short = await call('simulate_scene', {
    id: 'grid',
    switches: { line: false },
  })
  assert.match(short.text, /short/)

  const svg = await call('render_scene', { file: 'kettle.json', hour: 7.5 })
  assert.match(svg.text, /^<\?xml/)
  assert.match(svg.text, /<svg[^>]+width="/)
  const saved = JSON.parse(
    (
      await call('render_scene', {
        id: 'solar-home',
        hour: 13,
        theme: 'dark',
        out: 'out/solar.svg',
      })
    ).text,
  )
  assert.ok(readFileSync(saved.saved, 'utf8').includes('</svg>'))

  const link = JSON.parse(
    (await call('share_link', { file: 'kettle.json', view: 'embed' })).text,
  )
  assert.match(link.url, /embed=1#scene=/)
  assert.match(link.iframe, /^<iframe/)
})

test('mistakes come back as tool errors a model can act on', async () => {
  const bad = await call('validate_scene', {
    scene: {
      ...kettle,
      links: [{ from: 'grid', to: 'nowhere', domain: 'electric' }],
    },
  })
  assert.match(JSON.parse(bad.text).errors[0], /nowhere/)
  const refused = await call('write_scene', {
    file: 'bad.json',
    scene: { id: 'x' },
  })
  assert.equal(refused.error, true)
  const escape = await call('write_scene', { file: 'evil.sh', scene: kettle })
  assert.equal(escape.error, true)
  assert.match(escape.text, /\.json/)
  const knob = await call('simulate_scene', { id: 'grid', knobs: { nope: 1 } })
  assert.equal(knob.error, true)
})
