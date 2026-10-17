#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The P&ID eval's runner: give a real assistant each scenario in
 * scenarios.json, in an empty folder holding only the scenario's input files,
 * and grade what it leaves behind with grade.mjs.
 *
 *   npm run build:mcp
 *   node eval/pid/run.mjs --mode mcp            # with the Anigram MCP server
 *   node eval/pid/run.mjs --mode bare           # same prompts, no Anigram
 *   node eval/pid/run.mjs --mode both --only c01-draw,ratio-blend --model sonnet
 *
 * The runner is blind by construction. It is a separate headless Claude Code
 * process (`claude -p`) started in a fresh temp folder, with no settings,
 * CLAUDE.md or memory loaded (checked by asking it), and allowed only these tools:
 *
 *   mcp   Read/Write/Edit inside its folder, plus the anigram tools
 *   bare  Read/Write/Edit inside its folder, nothing else
 *
 * Reading outside the folder needs a permission nobody can grant in -p mode,
 * so the answer key (answers/) and the grader are out of its reach. It sees
 * the scenario's prompt, a short note saying what to save, and its files.
 *
 * Results go to eval/pid/results/<time>-<mode>.json; a table is printed.
 */

import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { grade } from './grade.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = join(here, '../..')
const server = join(repo, 'mcp/dist/anigram-mcp.mjs')

const { values: opts } = parseArgs({
  options: {
    mode: { type: 'string', default: 'both' },
    only: { type: 'string' },
    runs: { type: 'string', default: '1' },
    model: { type: 'string' },
    timeout: { type: 'string', default: '900' },
    keep: { type: 'boolean', default: false },
    jobs: { type: 'string', default: '1' },
  },
})

const PREFIX = 'mcp__anigram__'

/** what each kind of assistant is told to leave behind; nothing about grading */
const SUFFIX = {
  mcp: '\n\nUse the anigram tools. Make it a P&ID (drawing "pid"), keep any tags I gave exactly as written, and save the finished scene as scene.json in the current directory. If I described how it should behave, put that in its `expect` list and make sure check_scene passes.',
  bare: `\n\nYou have no diagram tool, so draw it yourself. Keep any tags I gave exactly as written. Save the P&ID as an SVG drawing, pid.svg, in the current directory. Also save pid.json, a machine-readable list of everything on the drawing, in exactly this shape:

{ "items": [ { "tag": "P-101", "type": "centrifugal pump", "label": "Transfer pump" } ],
  "lines": [ { "from": "T-101", "to": "P-101", "kind": "process" } ] }

Every item (equipment, valve, instrument, controller) has a unique tag; "type" says what it is in plain words; "kind" is "process" for pipes and "signal" for instrument and control signals. If I described how it should behave, show that as well as you can in the drawing.`,
}

const all = JSON.parse(readFileSync(join(here, 'scenarios.json'), 'utf8'))
const only = opts.only?.split(',').map((s) => s.trim())
const cases = all.filter((c) => !only || only.includes(c.id))
if (only && cases.length !== only.length)
  throw new Error(
    `unknown scenario id; the ids are ${all.map((c) => c.id).join(', ')}`,
  )
const modes = opts.mode === 'both' ? ['mcp', 'bare'] : [opts.mode]
for (const m of modes)
  if (!SUFFIX[m]) throw new Error(`--mode is mcp, bare or both, not ${m}`)
if (modes.includes('mcp') && !existsSync(server))
  throw new Error('build the server first: npm run build:mcp')

/** the parent's environment minus anything that would load memory or notes */
function isolated() {
  const env = { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }
  for (const k of [
    'CLAUDE_MEMORY_STORES',
    'CLAUDE_COWORK_MEMORY_PATH_OVERRIDE',
    'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD',
    'CLAUDE_ADDITIONAL_DIRECTORIES',
    'CLAUDE_CODE_PROJECTS_SESSION',
    'CLAUDE_CODE_SYNC_SKILLS',
    'CLAUDE_CODE_SYNC_PLUGINS',
  ])
    delete env[k]
  return env
}

/** run Claude Code on one prompt in its own folder; resolve with its event stream */
function runClaude(dir, mode, prompt) {
  const config = join(dir, '.mcp.json')
  writeFileSync(
    config,
    JSON.stringify({
      mcpServers:
        mode === 'mcp'
          ? { anigram: { command: process.execPath, args: [server] } }
          : {},
    }),
  )
  const allowed = ['Read(./**)', 'Write(./**)', 'Edit(./**)']
  if (mode === 'mcp') allowed.push(`${PREFIX}*`)
  const args = [
    '-p',
    prompt + SUFFIX[mode],
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--mcp-config',
    config,
    '--strict-mcp-config',
    '--tools',
    'Read,Write,Edit',
    '--allowedTools',
    ...allowed,
  ]
  if (opts.model) args.push('--model', opts.model)
  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: dir,
      env: isolated(),
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

/** tool calls, refused reads outside the folder, and the result line */
function trace(events) {
  const calls = new Map()
  const order = []
  for (const e of events) {
    for (const c of e.message?.content ?? []) {
      if (c.type === 'tool_use') {
        const call = {
          tool: c.name.startsWith(PREFIX)
            ? c.name.slice(PREFIX.length)
            : c.name,
          error: false,
        }
        calls.set(c.id, call)
        order.push(call)
      }
      if (c.type === 'tool_result' && calls.has(c.tool_use_id))
        calls.get(c.tool_use_id).error = !!c.is_error
    }
  }
  const result = events.findLast((e) => e.type === 'result') ?? {}
  return { order, result, denied: result.permission_denials?.length ?? 0 }
}

/** tokens from Claude Code's result line: fresh input, cache writes, cache reads, output */
function tokens(result) {
  const u = result.usage ?? {}
  const t = {
    input: u.input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  }
  return {
    tokens: { ...t, total: t.input + t.cacheWrite + t.cacheRead + t.output },
  }
}

const runs = Number(opts.runs)
for (const mode of modes) {
  const todo = cases.flatMap((c) =>
    Array.from({ length: runs }, (_, i) => ({ c, i })),
  )
  const rows = []
  const one = async ({ c, i }) => {
    const dir = mkdtempSync(join(tmpdir(), `anigram-pid-${mode}-${c.id}-`))
    for (const [name, from] of Object.entries(c.files ?? {}))
      copyFileSync(join(repo, from), join(dir, name))
    const started = Date.now()
    let { code, events, err } = await runClaude(dir, mode, c.prompt)
    // an API outage ends a run before it starts; that says nothing about the
    // assistant, so wait and ask again (twice at most)
    for (
      let k = 0;
      k < 2 && code !== 0 && !trace(events).result.total_cost_usd;
      k++
    ) {
      await new Promise((r) => setTimeout(r, 60_000))
      ;({ code, events, err } = await runClaude(dir, mode, c.prompt))
    }
    const { order, result, denied } = trace(events)
    const score = await grade(dir, c.id, { mode })
    const row = {
      id: c.id,
      mode,
      run: i + 1,
      dir,
      exit: code,
      ...score,
      calls: order.length,
      errors: order.filter((x) => x.error).length,
      denied,
      tools: order.map((x) => x.tool + (x.error ? '!' : '')),
      turns: result.num_turns ?? null,
      cost: result.total_cost_usd ?? null,
      ...tokens(result),
      models: Object.keys(result.modelUsage ?? {}),
      seconds: Math.round((Date.now() - started) / 1000),
    }
    if (code !== 0 && !events.length) row.stderr = err.slice(-2000)
    // keep what it made, so a result can be looked at and re-graded later
    if (opts.keep) {
      const keep = join(here, 'results/runs', mode, `${c.id}-${i + 1}`)
      mkdirSync(keep, { recursive: true })
      for (const f of ['scene.json', 'pid.svg', 'pid.json'])
        if (existsSync(join(dir, f))) copyFileSync(join(dir, f), join(keep, f))
    }
    rows.push(row)
    process.stderr.write(
      `${mode} ${c.id} #${i + 1}: static ${pct(row.static)}, behaviour ${pct(row.behaviour)}\n`,
    )
  }
  // a few at a time; each run has its own folder and server
  const queue = [...todo]
  await Promise.all(
    Array.from({ length: Number(opts.jobs) }, async () => {
      while (queue.length) await one(queue.shift())
    }),
  )
  const order = cases.map((c) => c.id)
  rows.sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.run - b.run,
  )

  // behaviour is averaged over the scenarios that make behaviour claims only
  const mean = (k, of = rows) =>
    of.length ? of.reduce((a, r) => a + (r[k] ?? 0), 0) / of.length : 0
  const sum = (f) => rows.reduce((a, r) => a + (f(r) ?? 0), 0)
  const summary = {
    when: new Date().toISOString(),
    mode,
    model: opts.model ?? 'default',
    models: [...new Set(rows.flatMap((r) => r.models))],
    runs: rows.length,
    delivered: mean('delivered'),
    static: mean('static'),
    behaviour: mean(
      'behaviour',
      rows.filter((r) => r.behaviour !== null && r.behaviour !== undefined),
    ),
    cost: sum((r) => r.cost),
    tokens: Object.fromEntries(
      ['input', 'cacheWrite', 'cacheRead', 'output', 'total'].map((k) => [
        k,
        sum((r) => r.tokens[k]),
      ]),
    ),
    seconds: mean('seconds'),
  }
  const outDir = join(here, 'results')
  mkdirSync(outDir, { recursive: true })
  const file = join(
    outDir,
    `${summary.when.replace(/[:.]/g, '-')}-${mode}.json`,
  )
  writeFileSync(file, `${JSON.stringify({ summary, rows }, null, 2)}\n`)

  console.log(`\n## ${mode}\n`)
  console.log(
    '| scenario | delivered | static | behaviour | calls (errors) | turns | tokens (output) | seconds | cost |',
  )
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const r of rows)
    console.log(
      `| ${r.id}${runs > 1 ? ` #${r.run}` : ''} | ${pct(r.delivered)} | ${pct(r.static)} | ${r.behaviour === null || r.behaviour === undefined ? '–' : pct(r.behaviour)} | ${r.calls} (${r.errors}) | ${r.turns ?? '–'} | ${r.tokens.total} (${r.tokens.output}) | ${r.seconds} | ${r.cost === null ? '–' : `$${r.cost.toFixed(2)}`} |`,
    )
  console.log(
    `\n${rows.length} runs: ${pct(summary.delivered)} delivered, static ${pct(summary.static)}, behaviour ${pct(summary.behaviour)}; ${summary.tokens.total} tokens (${summary.tokens.output} output), ${Math.round(summary.seconds)} s a run, $${summary.cost.toFixed(2)} in all.\n${file}`,
  )
}

function pct(v) {
  return v === null || v === undefined ? '–' : `${Math.round(100 * v)}%`
}
