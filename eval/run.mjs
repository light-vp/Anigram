#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The MCP eval: give a real assistant each paragraph in prompts.json, with
 * only the Anigram server to work with, and score what it made. This is how
 * "right first time" is measured instead of guessed, and how a change to the
 * guide text or a tool description shows up as better or worse.
 *
 *   npm run build:mcp
 *   node eval/run.mjs                      # every prompt, once
 *   node eval/run.mjs --only hydrogen,ev-hub --runs 3 --model sonnet
 *
 * It drives Claude Code headless (`claude -p`), so it needs the `claude` CLI
 * signed in, and it spends real tokens: each prompt costs roughly what one
 * chat to build a sheet does. Results go to eval/results/<time>.json, and a
 * table is printed.
 *
 * Per run it records:
 *   saved      scene.json was written
 *   valid      it validates
 *   expect     how many claims its `expect` list makes
 *   holds      every claim holds (check_scene ok, with at least one claim)
 *   first      the first write_scene call was accepted (right first time)
 *   looked     it rendered the sheet to look at it
 *   calls      Anigram tool calls, and how many came back as errors
 *   turns, cost, seconds   from Claude Code's own result line
 *
 * Prompts with a `drawing` ask for an engineering sheet, and also record:
 *   practice   the scene is that drawing type
 *   standard   check_drawing has nothing to mark up (and how many it found)
 *   tidy       lint_layout has nothing to mark up (and how many it found)
 *   dexpi      a P&ID exports to DEXPI with nothing left out
 * A prompt's `files` ({ "name in the folder": "path in the repo" }) are
 * copied into the folder it runs in, for prompts about a file the user has.
 *
 * The summary gives each practice its own line, so steering for one
 * practice can be tuned without hiding what it does to the others.
 *
 *   node eval/run.mjs --practice pid,single-line,pfd   # the engineering prompts
 */

import { spawn } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const server = join(here, '../mcp/dist/anigram-mcp.mjs')

const { values: opts } = parseArgs({
  options: {
    only: { type: 'string' },
    practice: { type: 'string' },
    runs: { type: 'string', default: '1' },
    model: { type: 'string' },
    timeout: { type: 'string', default: '600' },
  },
})

const PREFIX = 'mcp__anigram__'
const SUFFIX =
  '\n\nUse the anigram tools. Save the finished scene as scene.json in the current directory, with an `expect` list that states each claim above, and make sure check_scene passes.'

const all = JSON.parse(readFileSync(join(here, 'prompts.json'), 'utf8'))
const only = opts.only?.split(',').map((s) => s.trim())
const practices = opts.practice?.split(',').map((s) => s.trim())
const cases = all.filter(
  (c) =>
    (!only || only.includes(c.id)) &&
    (!practices || practices.includes(c.drawing ?? 'pictorial')),
)
if (only && cases.length !== only.length)
  throw new Error(
    `unknown prompt id; the ids are ${all.map((c) => c.id).join(', ')}`,
  )

/** run Claude Code on one prompt in its own folder; resolve with its event stream */
function runClaude(dir, prompt) {
  const config = join(dir, '.mcp-eval.json')
  writeFileSync(
    config,
    JSON.stringify({
      mcpServers: { anigram: { command: process.execPath, args: [server] } },
    }),
  )
  const args = [
    '-p',
    prompt + SUFFIX,
    '--output-format',
    'stream-json',
    '--verbose',
    '--mcp-config',
    config,
    '--strict-mcp-config',
    '--allowedTools',
    `${PREFIX}*`,
  ]
  if (opts.model) args.push('--model', opts.model)
  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(
      () => child.kill('SIGTERM'),
      Number(opts.timeout) * 1000,
    )
    child.on('close', (code) => {
      clearTimeout(timer)
      const events = out
        .split('\n')
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l)]
          } catch {
            return []
          }
        })
      resolve({ code, events, err })
    })
  })
}

/** what the assistant did, read from the stream */
function trace(events) {
  const calls = new Map()
  const order = []
  for (const e of events) {
    for (const c of e.message?.content ?? []) {
      if (c.type === 'tool_use' && c.name.startsWith(PREFIX)) {
        const call = { tool: c.name.slice(PREFIX.length), error: false }
        calls.set(c.id, call)
        order.push(call)
      }
      if (c.type === 'tool_result' && calls.has(c.tool_use_id))
        calls.get(c.tool_use_id).error = !!c.is_error
    }
  }
  const result = events.findLast((e) => e.type === 'result') ?? {}
  return { order, result }
}

/** check the saved scene with the server itself */
async function score(dir, drawing) {
  const client = new Client({ name: 'anigram-eval', version: '0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [server],
      cwd: dir,
    }),
  )
  try {
    const r = await client.callTool({
      name: 'check_scene',
      arguments: { file: 'scene.json' },
    })
    if (r.isError) return { saved: false }
    const d = r.structuredContent
    const row = {
      saved: true,
      valid: d.errors.length === 0,
      expect: d.expect.length,
      holds: d.ok && d.expect.length > 0,
      failing: d.expect.filter((x) => !x.ok).map((x) => x.says),
    }
    if (!drawing || !row.valid) return row
    const call = async (name, args = {}) =>
      await client.callTool({
        name,
        arguments: { file: 'scene.json', ...args },
      })
    const std = (await call('check_drawing')).structuredContent
    const lint = (await call('lint_layout')).structuredContent
    row.practice = std.drawing === drawing
    row.findings = std.findings.length
    row.standard = row.practice && std.findings.length === 0
    row.rules = [...new Set(std.findings.map((f) => f.rule))]
    row.layout = lint.findings.length
    row.tidy = lint.findings.length === 0
    if (drawing === 'pid' && row.practice) {
      const x = await call('export_dexpi')
      row.dexpi = !x.isError && x.structuredContent.notes.length === 0
    }
    return row
  } finally {
    await client.close()
  }
}

const runs = Number(opts.runs)
const rows = []
for (const c of cases) {
  for (let i = 0; i < runs; i++) {
    const dir = mkdtempSync(join(tmpdir(), `anigram-eval-${c.id}-`))
    // files the prompt talks about, copied in from the repo
    for (const [name, from] of Object.entries(c.files ?? {}))
      copyFileSync(join(here, '..', from), join(dir, name))
    const started = Date.now()
    process.stderr.write(`${c.id} #${i + 1} … `)
    const { code, events, err } = await runClaude(dir, c.prompt)
    const { order, result } = trace(events)
    const s = await score(dir, c.drawing)
    const firstWrite = order.find((x) => x.tool === 'write_scene')
    const row = {
      id: c.id,
      drawing: c.drawing ?? 'pictorial',
      run: i + 1,
      dir,
      exit: code,
      ...s,
      first: firstWrite ? !firstWrite.error : false,
      looked: order.some((x) => x.tool === 'render_scene'),
      calls: order.length,
      errors: order.filter((x) => x.error).length,
      tools: order.map((x) => x.tool + (x.error ? '!' : '')),
      turns: result.num_turns ?? null,
      cost: result.total_cost_usd ?? null,
      seconds: Math.round((Date.now() - started) / 1000),
    }
    if (code !== 0 && !events.length) row.stderr = err.slice(-2000)
    rows.push(row)
    process.stderr.write(
      `${row.holds ? 'holds' : row.valid ? 'valid' : row.saved ? 'invalid' : 'nothing saved'}\n`,
    )
  }
}

const pct = (k, of = rows) =>
  of.length
    ? `${Math.round((100 * of.filter((r) => r[k]).length) / of.length)}%`
    : '–'
const mean = (k, of = rows) =>
  of.length
    ? (of.reduce((a, r) => a + (r[k] ?? 0), 0) / of.length).toFixed(1)
    : '0'
const summary = {
  when: new Date().toISOString(),
  model: opts.model ?? 'default',
  runs: rows.length,
  valid: pct('valid'),
  holds: pct('holds'),
  first: pct('first'),
  looked: pct('looked'),
  calls: mean('calls'),
  errors: mean('errors'),
  cost: rows.reduce((a, r) => a + (r.cost ?? 0), 0).toFixed(2),
  // each practice on its own, so one can be tuned without hiding the others
  practices: Object.fromEntries(
    [...new Set(rows.map((r) => r.drawing))].map((d) => {
      const of = rows.filter((r) => r.drawing === d)
      return [
        d,
        {
          runs: of.length,
          holds: pct('holds', of),
          first: pct('first', of),
          ...(d === 'pictorial'
            ? {}
            : {
                practice: pct('practice', of),
                standard: pct('standard', of),
                tidy: pct('tidy', of),
                findings: mean('findings', of),
                ...(d === 'pid' ? { dexpi: pct('dexpi', of) } : {}),
              }),
          calls: mean('calls', of),
        },
      ]
    }),
  ),
}

const outDir = join(here, 'results')
mkdirSync(outDir, { recursive: true })
const file = join(outDir, `${summary.when.replace(/[:.]/g, '-')}.json`)
writeFileSync(file, `${JSON.stringify({ summary, rows }, null, 2)}\n`)

const yes = (v) => (v ? '✓' : '·')
console.log(
  '| prompt | valid | holds | first try | looked | standard | tidy | calls (errors) | turns | cost |',
)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
const eng = (r, k, n) =>
  r.drawing === 'pictorial' ? '–' : `${yes(r[k])}${r[n] ? ` (${r[n]})` : ''}`
for (const r of rows)
  console.log(
    `| ${r.id}${runs > 1 ? ` #${r.run}` : ''} | ${yes(r.valid)} | ${yes(r.holds)} | ${yes(r.first)} | ${yes(r.looked)} | ${eng(r, 'standard', 'findings')} | ${eng(r, 'tidy', 'layout')} | ${r.calls} (${r.errors}) | ${r.turns ?? '–'} | ${r.cost === null ? '–' : `$${r.cost.toFixed(2)}`} |`,
  )
console.log(
  '\n| practice | runs | holds | first try | right type | standard | tidy | DEXPI | calls |',
)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const [d, p] of Object.entries(summary.practices))
  console.log(
    `| ${d} | ${p.runs} | ${p.holds} | ${p.first} | ${p.practice ?? '–'} | ${p.standard ?? '–'} | ${p.tidy ?? '–'} | ${p.dexpi ?? '–'} | ${p.calls} |`,
  )
console.log(
  `\n${summary.runs} runs: ${summary.valid} valid, ${summary.holds} tell their story, ${summary.first} right first time, ${summary.looked} looked at their drawing; ${summary.calls} calls (${summary.errors} errors) each; $${summary.cost} in all.\n${file}`,
)
