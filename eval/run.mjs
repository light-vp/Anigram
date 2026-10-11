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
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const cases = only ? all.filter((c) => only.includes(c.id)) : all
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
async function score(dir) {
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
    return {
      saved: true,
      valid: d.errors.length === 0,
      expect: d.expect.length,
      holds: d.ok && d.expect.length > 0,
      failing: d.expect.filter((x) => !x.ok).map((x) => x.says),
    }
  } finally {
    await client.close()
  }
}

const runs = Number(opts.runs)
const rows = []
for (const c of cases) {
  for (let i = 0; i < runs; i++) {
    const dir = mkdtempSync(join(tmpdir(), `anigram-eval-${c.id}-`))
    const started = Date.now()
    process.stderr.write(`${c.id} #${i + 1} … `)
    const { code, events, err } = await runClaude(dir, c.prompt)
    const { order, result } = trace(events)
    const s = await score(dir)
    const firstWrite = order.find((x) => x.tool === 'write_scene')
    const row = {
      id: c.id,
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

const pct = (k) =>
  `${Math.round((100 * rows.filter((r) => r[k]).length) / rows.length)}%`
const mean = (k) =>
  rows.length
    ? (rows.reduce((a, r) => a + (r[k] ?? 0), 0) / rows.length).toFixed(1)
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
}

const outDir = join(here, 'results')
mkdirSync(outDir, { recursive: true })
const file = join(outDir, `${summary.when.replace(/[:.]/g, '-')}.json`)
writeFileSync(file, `${JSON.stringify({ summary, rows }, null, 2)}\n`)

const yes = (v) => (v ? '✓' : '·')
console.log(
  '| prompt | valid | holds | first try | looked | calls (errors) | turns | cost |',
)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of rows)
  console.log(
    `| ${r.id}${runs > 1 ? ` #${r.run}` : ''} | ${yes(r.valid)} | ${yes(r.holds)} | ${yes(r.first)} | ${yes(r.looked)} | ${r.calls} (${r.errors}) | ${r.turns ?? '–'} | ${r.cost === null ? '–' : `$${r.cost.toFixed(2)}`} |`,
  )
console.log(
  `\n${summary.runs} runs: ${summary.valid} valid, ${summary.holds} tell their story, ${summary.first} right first time, ${summary.looked} looked at their drawing; ${summary.calls} calls (${summary.errors} errors) each; $${summary.cost} in all.\n${file}`,
)
