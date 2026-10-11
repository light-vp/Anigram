// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// Drives the built server over stdio the way an assistant would:
// `npm run build:mcp && node --test mcp/smoke.test.mjs`
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
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
  return {
    error: !!r.isError,
    text: r.content.find((c) => c.type === 'text')?.text,
    image: r.content.find((c) => c.type === 'image'),
    data: r.structuredContent,
  }
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

test('--version prints the package version and exits', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
  )
  const out = execFileSync(process.execPath, [server, '--version'], {
    encoding: 'utf8',
  })
  assert.equal(out.trim(), pkg.version)
  assert.match(
    execFileSync(process.execPath, [server, '--help'], { encoding: 'utf8' }),
    /ANIGRAM_ALLOW_PATHS/,
  )
})

test('lists its tools', async () => {
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, [
    'anigram_guide',
    'check_scene',
    'edit_scene',
    'get_scene',
    'list_scenes',
    'new_scene',
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
  const list = await call('list_scenes')
  assert.equal(list.data.scenes.length, 5)
  assert.deepEqual(JSON.parse(list.text), list.data)
  const grid = await call('get_scene', { id: 'grid' })
  assert.equal(grid.data.sheet, 'LD-001')
  assert.equal(grid.data.anigram, 1)
  assert.deepEqual(JSON.parse(grid.text), grid.data)
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
  assert.deepEqual(sim.data.unmet, {})
  assert.ok(sim.data.totals.kettle.in > 0)
  assert.equal(sim.data.rows, undefined, 'rows only come with format json')
  const full = await call('simulate_scene', {
    file: 'kettle.json',
    format: 'json',
  })
  assert.ok(full.data.rows.length >= 24)

  const short = await call('simulate_scene', {
    id: 'grid',
    switches: { line: false },
  })
  assert.match(short.text, /short/)
  assert.ok(Object.keys(short.data.unmet).length > 0)
  assert.ok(short.data.alerts.some((a) => /short/.test(a.text)))

  const svg = await call('render_scene', {
    file: 'kettle.json',
    hour: 7.5,
    format: 'svg',
  })
  assert.match(svg.text, /^<\?xml/)
  assert.match(svg.text, /<svg[^>]+width="/)
  assert.equal(svg.data.hour, 7.5)
  assert.equal(svg.data.bytes, svg.text.length)
  const saved = await call('render_scene', {
    id: 'solar-home',
    hour: 13,
    theme: 'dark',
    out: 'out/solar.svg',
  })
  assert.ok(readFileSync(saved.data.saved, 'utf8').includes('</svg>'))
  assert.equal(saved.data.format, 'svg')

  const link = (
    await call('share_link', { file: 'kettle.json', view: 'embed' })
  ).data
  assert.match(
    link.url,
    /^https:\/\/anigram\.vaibhav\.co\.uk\/\?embed=1#scene=/,
  )
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

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test('render_scene shows the assistant a PNG by default', async () => {
  const r = await call('render_scene', { id: 'grid', hour: 18 })
  assert.equal(r.error, false, r.text)
  assert.equal(r.image.mimeType, 'image/png')
  const png = Buffer.from(r.image.data, 'base64')
  assert.deepEqual([...png.subarray(0, 8)], PNG_MAGIC)
  assert.equal(r.data.format, 'png')
  assert.equal(r.data.width, 1600)
  assert.equal(r.data.bytes, png.length)
  assert.ok(
    Math.abs(r.data.width / r.data.height - r.data.aspect) < 0.01,
    'keeps the sheet’s proportions',
  )
  // a drawing with colour and text in it, not a blank or all-black frame:
  // the earlier, unflattened render came out a few KB of solid black
  assert.ok(png.length > 40_000, `only ${png.length} bytes`)

  const small = await call('render_scene', { id: 'grid', width: 400 })
  assert.equal(small.data.width, 400)

  const saved = await call('render_scene', {
    id: 'solar-home',
    theme: 'dark',
    out: 'out/solar.png',
  })
  assert.equal(saved.image, undefined, 'a saved PNG is not sent back too')
  const disk = readFileSync(saved.data.saved)
  assert.deepEqual([...disk.subarray(0, 8)], PNG_MAGIC)

  const clash = await call('render_scene', {
    id: 'grid',
    format: 'svg',
    out: 'x.png',
  })
  assert.equal(clash.error, true)
  const bad = await call('render_scene', { id: 'grid', out: 'x.gif' })
  assert.match(bad.text, /\.png, \.svg or \.pdf/)
})

test('render_scene prints a PDF on ISO A paper', async () => {
  const r = await call('render_scene', {
    id: 'water-tower',
    out: 'print/tower.pdf',
    paper: 'A4',
  })
  assert.equal(r.error, false, r.text)
  assert.equal(r.data.format, 'pdf')
  assert.equal(r.data.paper, 'A4')
  const pdf = readFileSync(r.data.saved)
  assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.4')
  assert.match(pdf.subarray(-6).toString('latin1'), /%%EOF\n$/)
  const text = pdf.toString('latin1')
  // an A4 landscape page, with the sheet as one image and its title filed
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/)
  assert.match(text, /\/Subtype \/Image/)
  assert.match(text, /\/Title <feff/)
  // the cross-reference table points at each object
  const xref = Number(/startxref\n(\d+)/.exec(text)[1])
  assert.equal(text.slice(xref, xref + 4), 'xref')
  for (const [, off, n] of text
    .slice(xref)
    .matchAll(/^(\d{10}) 00000 n $/gm)
    .map((m, i) => [m[0], Number(m[1]), i + 1]))
    assert.equal(text.slice(off, off + `${n} 0 obj`.length), `${n} 0 obj`)

  const loose = await call('render_scene', { id: 'grid', format: 'pdf' })
  assert.match(loose.text, /a PDF is saved to a file: give `out`/)
  const wrong = await call('render_scene', { id: 'grid', paper: 'A3' })
  assert.match(wrong.text, /paper sets the PDF page/)
})

test('check_scene says whether the story holds, and why not', async () => {
  const good = await call('check_scene', { id: 'solar-home' })
  assert.equal(good.data.ok, true, good.text)
  assert.ok(good.data.expect.length >= 3)
  assert.match(good.text, /expectations hold/)

  const bad = await call('check_scene', {
    id: 'solar-home',
    switches: { ev: true },
  })
  assert.equal(bad.data.ok, false)
  const miss = bad.data.expect.find((r) => !r.ok)
  assert.ok(miss.failed.length > 0)
  assert.ok(Object.keys(miss.values).length > 0)
  assert.match(bad.text, /✗ .* fails at \d\d:00/)

  const none = await call('check_scene', { scene: kettle })
  assert.equal(none.data.ok, true)
  assert.match(none.text, /no `expect` list/)

  const broken = await call('check_scene', { scene: { id: 'x' } })
  assert.equal(broken.data.ok, false)
  assert.ok(broken.data.errors.length > 0)

  const sim = await call('simulate_scene', { id: 'grid' })
  assert.equal(sim.data.expect.length, 4)
  assert.match(sim.text, /expect \(4 of 4 hold\)/)
})

test('new_scene starts each practice from a sheet that already works', async () => {
  for (const drawing of ['pictorial', 'pid', 'single-line', 'pfd']) {
    const r = await call('new_scene', { drawing, id: `my-${drawing}` })
    assert.equal(r.error, false, r.text)
    assert.equal(r.data.drawing, drawing)
    assert.equal(r.data.scene.id, `my-${drawing}`)
    assert.ok(r.data.practice.length > 100)
    const check = await call('check_scene', { scene: r.data.scene })
    assert.equal(check.data.ok, true, check.text)
    assert.deepEqual(check.data.warnings ?? [], [])
  }
  const saved = await call('new_scene', { drawing: 'pid', file: 'plant.json' })
  assert.ok(existsSync(join(cwd, 'plant.json')))
  assert.equal(saved.data.saved, join(cwd, 'plant.json'))
  const plain = await call('new_scene')
  assert.equal(plain.data.drawing, 'pictorial')
})

test('each practice has a prompt that walks the job', async () => {
  const { prompts } = await client.listPrompts()
  assert.deepEqual(prompts.map((p) => p.name).sort(), [
    'draw-pfd',
    'draw-pid',
    'draw-sheet',
    'draw-single-line',
  ])
  const p = await client.getPrompt({
    name: 'draw-pid',
    arguments: { brief: 'a cooling water loop' },
  })
  const text = p.messages[0].content.text
  assert.match(text, /a cooling water loop/)
  assert.match(text, /ISA-5\.1/)
  assert.match(text, /new_scene with drawing "pid"/)
})

test('files stay inside the working directory', async () => {
  for (const file of ['../outside.json', join(tmpdir(), 'abs.json')]) {
    const r = await call('write_scene', { file, scene: kettle })
    assert.equal(r.error, true, file)
    assert.match(r.text, /outside the working directory/)
  }
  const read = await call('validate_scene', { file: '../../etc/x.json' })
  assert.equal(read.error, true)
  assert.match(read.text, /ANIGRAM_ALLOW_PATHS/)
  for (const out of ['../grid.svg', '../grid.png']) {
    const r = await call('render_scene', { id: 'grid', out })
    assert.equal(r.error, true, out)
  }
  // a symlink out of the folder is caught too
  symlinkSync(tmpdir(), join(cwd, 'link'))
  const via = await call('write_scene', {
    file: 'link/sneaky.json',
    scene: kettle,
  })
  assert.equal(via.error, true)
  assert.equal(existsSync(join(tmpdir(), 'sneaky.json')), false)
})

test('ANIGRAM_ALLOW_PATHS opens another folder', async () => {
  const other = mkdtempSync(join(tmpdir(), 'anigram-other-'))
  const second = new Client({ name: 'smoke-allow', version: '0' })
  await second.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [server],
      cwd,
      env: { ...process.env, ANIGRAM_ALLOW_PATHS: other },
    }),
  )
  try {
    const r = await second.callTool({
      name: 'write_scene',
      arguments: { file: join(other, 'kettle.json'), scene: kettle },
    })
    assert.equal(r.isError, undefined, r.content[0].text)
    assert.ok(existsSync(join(other, 'kettle.json')))
  } finally {
    await second.close()
  }
})

test('every data tool declares an output schema', async () => {
  const { tools } = await client.listTools()
  for (const t of tools)
    if (t.name !== 'anigram_guide')
      assert.equal(t.outputSchema?.type, 'object', t.name)
})
