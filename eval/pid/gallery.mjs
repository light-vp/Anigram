#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The evaluation as pictures, for the docs page: every kept run's drawing
 * next to its brief, scores, time and tokens. Anigram's scenes are drawn by
 * the built MCP server's render_scene (the drawing the grader looked at);
 * the runs without it are their own pid.svg. Writes public/eval/pid/, which
 * the docs page's gallery reads at runtime, so none of it rides in the app.
 *
 *   npm run build:mcp
 *   node eval/pid/gallery.mjs eval/pid/results/pass1 eval/pid/results/pass2
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = resolve(here, '../..')
const out = join(repo, 'public/eval/pid')
const passes = process.argv.slice(2)
if (!passes.length)
  throw new Error('usage: node eval/pid/gallery.mjs <pass folder>...')

const scenarios = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'))

/**
 * a hand-written SVG is served from the app's own origin, so anything that
 * could run is taken out (none of the kept runs had any)
 */
function clean(svg) {
  return svg
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*)("|')\s*javascript:[^"']*\2/gi, '$1$2#$2')
}

const server = new Client({ name: 'anigram-pid-gallery', version: '0' })
await server.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [join(repo, 'mcp/dist/anigram-mcp.mjs')],
    cwd: repo,
    stderr: 'ignore',
  }),
)
async function call(name, args) {
  const r = await server.callTool({ name, arguments: args })
  if (r.isError) return null
  return r
}

const round = (v, d = 3) =>
  v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d
const brief = (missing) =>
  Object.values(missing ?? {})
    .flat()
    .map((m) => m.replace(/^[a-z]+: /, ''))

rmSync(out, { recursive: true, force: true })
const shown = {}
for (const [p, dir] of passes.entries()) {
  const pass = `p${p + 1}`
  mkdirSync(join(out, pass), { recursive: true })
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).rows)
  for (const r of rows) {
    if (r.run !== 1) continue
    const kept = join(dir, 'runs', r.mode, `${r.id}-${r.run}`)
    const name = `${pass}/${r.id}-${r.mode}`
    let image = null
    let link = null
    if (r.mode === 'mcp' && existsSync(join(kept, 'scene.json'))) {
      const file = relative(repo, join(kept, 'scene.json'))
      const svg = (
        await call('render_scene', { file, format: 'svg' })
      )?.content?.find(
        (c) => c.type === 'text' && c.text.includes('<svg'),
      )?.text
      if (svg) {
        writeFileSync(join(out, `${name}.svg`), svg)
        image = `${name}.svg`
      }
      const url = (await call('share_link', { file }))?.structuredContent?.url
      // relative, so the link opens on whichever host serves the docs
      if (url) link = url.slice(url.indexOf('#'))
    } else if (r.mode === 'bare' && existsSync(join(kept, 'pid.svg'))) {
      writeFileSync(
        join(out, `${name}.svg`),
        clean(readFileSync(join(kept, 'pid.svg'), 'utf8')),
      )
      image = `${name}.svg`
    }
    ;((shown[r.id] ??= {})[pass] ??= {})[r.mode] = {
      image,
      link,
      static: round(r.static),
      behaviour: round(r.behaviour),
      scores: Object.fromEntries(
        Object.entries(r.scores ?? {}).map(([k, v]) => [k, round(v)]),
      ),
      missing: brief(r.missing),
      seconds: r.seconds ?? null,
      tokens: r.tokens?.total ? r.tokens.total : null,
      cost: round(r.cost, 2),
      calls: r.calls ?? null,
    }
  }
}
await server.close()

const gallery = {
  passes: passes.map((d, i) => ({ id: `p${i + 1}`, from: basename(d) })),
  scenarios: scenarios.map((c) => ({
    id: c.id,
    title: c.title,
    kind: c.source,
    prompt: c.prompt,
    runs: shown[c.id] ?? {},
  })),
}
writeFileSync(join(out, 'gallery.json'), `${JSON.stringify(gallery)}\n`)
console.log(
  `${gallery.scenarios.length} scenarios, ${passes.length} passes → ${relative(repo, out)}`,
)
