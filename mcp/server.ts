// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Anigram's MCP server: lets a coding assistant read, write, check, run and
 * draw living diagrams. Everything a person can do in the app, an assistant
 * can do here, plus the things only a headless run can — simulate a whole
 * day and read the numbers back.
 *
 * Runs over stdio. Paths are resolved against the directory the client
 * started it in and must stay inside it (or a folder ANIGRAM_ALLOW_PATHS
 * names), and it only ever reads .json files and writes .json, .svg and .png.
 *
 * Every tool that returns data also returns it as `structuredContent`,
 * checked against the tool's `outputSchema`; the text beside it is the same
 * data as JSON, or a readable summary, for clients that only show text.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import guideText from '../docs/scene-format.md?raw'
import { stamp } from '../src/format/migrate.ts'
import { reportTable, simulateDay } from '../src/format/report.ts'
import { SCHEMA_URL, sceneSchema } from '../src/format/schema.ts'
import { encodeScene, HASH_KEY } from '../src/format/share.ts'
import { DOMAINS, validateScene } from '../src/format/validate.ts'
import { PART_KINDS } from '../src/parts/kinds.ts'
import { SCENES } from '../src/scenes/index.ts'
import { FUNCTIONS, VARIABLES } from '../src/sim/expr.ts'
import type { Scene } from '../src/sim/types.ts'
import { sheetSize } from '../src/view/geometry.ts'
import { renderSheetSvg } from '../src/view/renderSvg.tsx'
import { svgToPng } from './png.ts'

const VERSION = '0.1.0'
const APP_URL = process.env.ANIGRAM_APP_URL ?? 'https://anigram.vaibhav.co.uk/'

/** PNG widths: the default is wide enough to read every flow label */
const PNG_WIDTH = 1600
const MIN_PNG_WIDTH = 200
const MAX_PNG_WIDTH = 4000

const server = new McpServer(
  { name: 'anigram', title: 'Anigram', version: VERSION },
  {
    instructions:
      'Anigram draws living diagrams: engineering sheets of real systems (power grids, solar houses, water towers, data centres) where every moving line is read off a flow simulation. ' +
      'A drawing is a JSON scene file. Call anigram_guide first for the format. Then: write the file (write_scene), validate it, simulate_scene to check the day tells the story you meant, ' +
      'render_scene to look at it (a PNG by default: check the layout reads cleanly), and share_link to open it live in the browser. Built-in sheets (list_scenes / get_scene) are good starting points to copy.',
  },
)

// ---------------------------------------------------------------- helpers

type Json = Record<string, unknown>

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (t: string) => ({ ...text(t), isError: true })

/** data for the model to read: structured, and as text (JSON unless a summary is given) */
const data = (v: Json, summary?: string) => ({
  ...text(summary ?? JSON.stringify(v, null, 2)),
  structuredContent: v,
})

/** a picture for the model to look at, with its details as data */
const image = (png: Uint8Array, v: Json) => ({
  content: [
    {
      type: 'image' as const,
      data: Buffer.from(png).toString('base64'),
      mimeType: 'image/png',
    },
    { type: 'text' as const, text: JSON.stringify(v, null, 2) },
  ],
  structuredContent: v,
})
type Result =
  ReturnType<typeof text> | ReturnType<typeof data> | ReturnType<typeof image>

/** width and height from a PNG's header */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: v.getUint32(16), height: v.getUint32(20) }
}

/** some clients send nested objects as JSON strings */
const objectish = z.union([z.record(z.string(), z.unknown()), z.string()])

const sceneInput = {
  scene: objectish.optional().describe('a scene object (or its JSON text)'),
  file: z
    .string()
    .optional()
    .describe('path to a .json scene file, relative to the working directory'),
  id: z
    .string()
    .optional()
    .describe('a built-in sheet id, e.g. "grid" — see list_scenes'),
}

const controlsInput = {
  knobs: z
    .record(z.string(), z.number())
    .optional()
    .describe('slider values by knob id, e.g. { "cloud": 0.8 }'),
  switches: z
    .record(z.string(), z.boolean())
    .optional()
    .describe('switch states by id, e.g. { "mains": false }'),
}

/** a path with symlinks resolved, even when its last parts don't exist yet */
function realish(p: string): string {
  const rest: string[] = []
  let cur = p
  while (!existsSync(cur)) {
    const up = dirname(cur)
    if (up === cur) break
    rest.unshift(basename(cur))
    cur = up
  }
  return join(realpathSync(cur), ...rest)
}

/** the folders files may be read from and written to */
const ROOTS = [
  process.cwd(),
  ...(process.env.ANIGRAM_ALLOW_PATHS ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((p) => resolve(process.cwd(), p)),
].map(realish)

function within(p: string, root: string): boolean {
  const r = relative(root, p)
  return r === '' || (!isAbsolute(r) && r.split(sep)[0] !== '..')
}

function pathFor(file: string, ext: '.json' | '.svg' | '.png'): string {
  const p = resolve(process.cwd(), file)
  if (extname(p).toLowerCase() !== ext)
    throw new Error(`${file}: expected a ${ext} path`)
  if (!ROOTS.some((root) => within(realish(p), root)))
    throw new Error(
      `${file}: outside the working directory (${process.cwd()}); ` +
        'set ANIGRAM_ALLOW_PATHS to let the server use other folders',
    )
  return p
}

function parseObject(v: Json | string, what: string): unknown {
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch (e) {
    throw new Error(`${what} is not valid JSON: ${(e as Error).message}`)
  }
}

/** the raw scene a tool was pointed at, before validation */
function rawScene(args: {
  scene?: Json | string
  file?: string
  id?: string
}): unknown {
  const given = [args.scene, args.file, args.id].filter((v) => v !== undefined)
  if (given.length !== 1)
    throw new Error('give exactly one of `scene`, `file` or `id`')
  if (args.scene !== undefined) return parseObject(args.scene, 'scene')
  if (args.file !== undefined)
    return parseObject(
      readFileSync(pathFor(args.file, '.json'), 'utf8'),
      args.file,
    )
  const s = SCENES.find((x) => x.id === args.id)
  if (!s)
    throw new Error(
      `no built-in sheet "${args.id}"; try ${SCENES.map((x) => x.id).join(', ')}`,
    )
  return stamp(JSON.parse(JSON.stringify(s)) as Scene)
}

/** a scene the solver can run, or an error listing what's wrong with it */
function loadScene(args: {
  scene?: Json | string
  file?: string
  id?: string
}): {
  scene: Scene
  warnings: string[]
} {
  const v = validateScene(rawScene(args))
  if (!v.scene)
    throw new Error(
      `the scene has ${v.errors.length} error(s):\n- ${v.errors.join('\n- ')}` +
        (v.warnings.length ? `\nwarnings:\n- ${v.warnings.join('\n- ')}` : ''),
    )
  return { scene: v.scene, warnings: v.warnings }
}

function checkControls(
  scene: Scene,
  c: { knobs?: Record<string, number>; switches?: Record<string, boolean> },
) {
  for (const k of Object.keys(c.knobs ?? {}))
    if (!scene.knobs?.some((x) => x.id === k))
      throw new Error(
        `no knob "${k}"; this scene has ${scene.knobs?.map((x) => x.id).join(', ') || 'none'}`,
      )
  for (const k of Object.keys(c.switches ?? {}))
    if (!scene.switches?.some((x) => x.id === k))
      throw new Error(
        `no switch "${k}"; this scene has ${scene.switches?.map((x) => x.id).join(', ') || 'none'}`,
      )
}

function aspect(scene: Scene): string {
  const { w, h } = sheetSize(scene)
  return (w / h).toFixed(3)
}

function writeFile(path: string, body: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

/** wrap a handler so a thrown error becomes a readable tool error, not a protocol failure */
function guarded<A>(fn: (args: A) => Promise<Result> | Result) {
  return async (args: A) => {
    try {
      return await fn(args)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}

function guide(): string {
  const groups = new Map<string, string[]>()
  for (const [kind, info] of Object.entries(PART_KINDS)) {
    const line = `- \`${kind}\` — ${info.draws} (usually a ${info.role})`
    groups.set(info.group, [...(groups.get(info.group) ?? []), line])
  }
  const kinds = [...groups]
    .map(([g, lines]) => `### ${g}\n${lines.join('\n')}`)
    .join('\n\n')
  const fns = Object.entries(FUNCTIONS)
    .map(([name, f]) => `- \`${name}()\` — ${f.doc}`)
    .join('\n')
  const vars = Object.entries(VARIABLES)
    .map(([name, doc]) => `- \`${name}\` — ${doc}`)
    .join('\n')
  const body = guideText.replace(/^<!--.*-->\n/gm, '')
  return `${body}\nThe format as a JSON Schema: the \`anigram://schema/scene\` resource, or ${SCHEMA_URL} (put it in a file's \`$schema\` so editors check it).\n\n## Signal functions\n\n${vars}\n${fns}\n\n## Parts\n\n${kinds}\n\nDomains: ${DOMAINS.join(', ')}.\n`
}

// ---------------------------------------------------------------- output shapes

const checked = {
  ok: z.boolean().describe('true when the scene has no errors'),
  errors: z.array(z.string()).describe('problems that stop it loading'),
  warnings: z
    .array(z.string())
    .describe('things that will run but are probably not what you meant'),
}

/** a scene file; only the fields every valid scene has are spelled out */
const sceneOutput = z.looseObject({
  anigram: z.number().describe('the format version'),
  id: z.string(),
  title: z.string(),
})

// ---------------------------------------------------------------- reading

server.registerTool(
  'anigram_guide',
  {
    title: 'Scene format guide',
    description:
      'Read this first. The scene file format: parts, behaviours, links, signal expressions, every part kind that has a drawing, and how to make a good sheet.',
    annotations: { readOnlyHint: true },
  },
  () => text(guide()),
)

server.registerResource(
  'scene-format',
  'anigram://guide',
  { title: 'Anigram scene format', mimeType: 'text/markdown' },
  (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'text/markdown', text: guide() }],
  }),
)

server.registerResource(
  'scene-schema',
  'anigram://schema/scene',
  {
    title: 'Anigram scene JSON Schema',
    description: `The scene format as a JSON Schema, also published at ${SCHEMA_URL}`,
    mimeType: 'application/schema+json',
  },
  (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/schema+json',
        text: JSON.stringify(sceneSchema(), null, 2),
      },
    ],
  }),
)

server.registerTool(
  'list_scenes',
  {
    title: 'List built-in sheets',
    description:
      'The built-in sheets: id, drawing number, title and subtitle. Each is a complete scene to read or copy.',
    outputSchema: {
      scenes: z.array(
        z.object({
          id: z.string(),
          sheet: z.string().optional(),
          title: z.string(),
          subtitle: z.string().optional(),
          parts: z.number(),
          links: z.number(),
        }),
      ),
    },
    annotations: { readOnlyHint: true },
  },
  () =>
    data({
      scenes: SCENES.map((s) => ({
        id: s.id,
        sheet: s.sheet,
        title: s.title,
        subtitle: s.subtitle,
        parts: s.parts.length,
        links: s.links.length,
      })),
    }),
)

server.registerTool(
  'get_scene',
  {
    title: 'Get a built-in sheet',
    description:
      'A built-in sheet as scene-file JSON — the best example of the format to copy from.',
    inputSchema: { id: z.string().describe('sheet id from list_scenes') },
    outputSchema: sceneOutput,
    annotations: { readOnlyHint: true },
  },
  guarded(({ id }: { id: string }) => data(rawScene({ id }) as Json)),
)

server.registerTool(
  'validate_scene',
  {
    title: 'Validate a scene',
    description:
      'Check a scene file. Errors stop it loading; warnings are things that will run but probably are not what you meant (a part nothing feeds, two parts in one cell, a kind with no drawing).',
    inputSchema: { scene: sceneInput.scene, file: sceneInput.file },
    outputSchema: checked,
    annotations: { readOnlyHint: true },
  },
  guarded((args: { scene?: Json | string; file?: string }) => {
    const v = validateScene(rawScene(args))
    return data({ ok: v.ok, errors: v.errors, warnings: v.warnings })
  }),
)

// ---------------------------------------------------------------- writing

server.registerTool(
  'write_scene',
  {
    title: 'Write a scene file',
    description:
      'Validate a scene and save it as a .json file. Refuses to write a scene with errors unless `force` is set, so a file on disk always loads.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'where to save it, a .json path relative to the working directory',
        ),
      scene: objectish.describe('the scene object (or its JSON text)'),
      force: z.boolean().optional().describe('save even if it has errors'),
    },
    outputSchema: {
      saved: z.string().describe('the absolute path written'),
      ...checked,
    },
    annotations: { destructiveHint: true, idempotentHint: true },
  },
  guarded((args: { file: string; scene: Json | string; force?: boolean }) => {
    const raw = parseObject(args.scene, 'scene')
    const v = validateScene(raw)
    if (!v.ok && !args.force)
      return fail(
        `not saved — ${v.errors.length} error(s):\n- ${v.errors.join('\n- ')}`,
      )
    const path = pathFor(args.file, '.json')
    writeFile(path, `${JSON.stringify(v.scene ?? raw, null, 2)}\n`)
    return data({
      saved: path,
      ok: v.ok,
      errors: v.errors,
      warnings: v.warnings,
    })
  }),
)

const partPatch = z.record(z.string(), z.unknown())
const editOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_part'), part: partPatch }),
  z.object({
    op: z.literal('update_part'),
    id: z.string(),
    set: partPatch.describe(
      'fields to replace on the part, e.g. { "at": [3, 1] } or a whole new "behaviour"',
    ),
  }),
  z.object({
    op: z.literal('remove_part'),
    id: z.string().describe('also removes every link to or from it'),
  }),
  z.object({ op: z.literal('add_link'), link: partPatch }),
  z.object({
    op: z.literal('update_link'),
    from: z.string(),
    to: z.string(),
    set: partPatch,
  }),
  z.object({ op: z.literal('remove_link'), from: z.string(), to: z.string() }),
  z.object({
    op: z.literal('set'),
    field: z.enum([
      'id',
      'title',
      'subtitle',
      'sheet',
      'size',
      'units',
      'scale',
      'knobs',
      'switches',
      'captions',
      'clock',
    ]),
    value: z.unknown(),
  }),
])
type EditOp = z.infer<typeof editOp>

function applyOps(scene: Json, ops: EditOp[]): Json {
  const s = structuredClone(scene)
  const parts = (s.parts ??= []) as Json[]
  let links = (s.links ??= []) as Json[]
  const part = (id: string) => {
    const p = parts.find((x) => x.id === id)
    if (!p) throw new Error(`no part "${id}"`)
    return p
  }
  const link = (from: string, to: string) => {
    const l = links.find((x) => x.from === from && x.to === to)
    if (!l) throw new Error(`no link ${from} → ${to}`)
    return l
  }
  for (const op of ops) {
    switch (op.op) {
      case 'add_part':
        if (parts.some((x) => x.id === op.part.id))
          throw new Error(`part "${String(op.part.id)}" already exists`)
        parts.push(op.part)
        break
      case 'update_part':
        Object.assign(part(op.id), op.set)
        break
      case 'remove_part':
        parts.splice(parts.indexOf(part(op.id)), 1)
        links = links.filter((l) => l.from !== op.id && l.to !== op.id)
        break
      case 'add_link':
        links.push(op.link)
        break
      case 'update_link':
        Object.assign(link(op.from, op.to), op.set)
        break
      case 'remove_link':
        links.splice(links.indexOf(link(op.from, op.to)), 1)
        break
      case 'set':
        s[op.field] = op.value
        break
    }
  }
  s.links = links
  return s
}

server.registerTool(
  'edit_scene',
  {
    title: 'Edit a scene',
    description:
      'Apply small edits — add, move, update or remove parts and links, or set a top-level field — without rewriting the whole file. ' +
      'With `file`, the file is updated in place (only if the result is valid, unless `force`). Returns the edited scene and its validation.',
    inputSchema: {
      ...sceneInput,
      ops: z.array(editOp).min(1).describe('edits, applied in order'),
      force: z
        .boolean()
        .optional()
        .describe('save to `file` even if the result has errors'),
    },
    outputSchema: {
      saved: z
        .string()
        .nullable()
        .describe('the path written, or null when nothing was saved'),
      ...checked,
      scene: z
        .record(z.string(), z.unknown())
        .describe('the edited scene, normalised when it is valid'),
    },
    annotations: { destructiveHint: true },
  },
  guarded(
    (args: {
      scene?: Json | string
      file?: string
      id?: string
      ops: EditOp[]
      force?: boolean
    }) => {
      const edited = applyOps(rawScene(args) as Json, args.ops)
      const v = validateScene(edited)
      let saved: string | undefined
      if (args.file && (v.ok || args.force)) {
        saved = pathFor(args.file, '.json')
        writeFile(saved, `${JSON.stringify(v.scene ?? edited, null, 2)}\n`)
      }
      return data({
        saved: saved ?? null,
        ok: v.ok,
        errors: v.errors,
        warnings: v.warnings,
        scene: v.scene ?? edited,
      })
    },
  ),
)

// ---------------------------------------------------------------- running

server.registerTool(
  'simulate_scene',
  {
    title: 'Simulate a day',
    description:
      'Run the scene headless through 24 hours from its opening hour and report what every part did, hour by hour, every alert (a demand going short, a store running empty, a link at its limit) and the day’s totals. ' +
      'Use it to check the drawing tells the story its captions claim, and to tune signals.',
    inputSchema: {
      ...sceneInput,
      ...controlsInput,
      parts: z
        .array(z.string())
        .optional()
        .describe('only show these part ids in the table'),
      format: z
        .enum(['table', 'json'])
        .optional()
        .describe(
          'table (default) is a compact hour-by-hour text; json also puts every hourly number in the result',
        ),
    },
    outputSchema: {
      sheet: z.string().optional(),
      title: z.string(),
      start: z.number().describe('the hour the day started at'),
      alerts: z
        .array(z.object({ text: z.string(), hours: z.array(z.number()) }))
        .describe('every distinct alert, with the hours it was showing'),
      totals: z
        .record(
          z.string(),
          z.object({
            in: z.number(),
            out: z.number(),
            unmet: z.number().optional(),
          }),
        )
        .describe("per part, the day's throughput (rate × hours)"),
      unmet: z
        .record(z.string(), z.number())
        .describe('demands that went short over the day, by part id'),
      warnings: z.array(z.string()),
      rows: z
        .array(z.record(z.string(), z.unknown()))
        .optional()
        .describe('hour by hour, with format json'),
    },
    annotations: { readOnlyHint: true },
  },
  guarded(
    (args: {
      scene?: Json | string
      file?: string
      id?: string
      knobs?: Record<string, number>
      switches?: Record<string, boolean>
      parts?: string[]
      format?: 'table' | 'json'
    }) => {
      const { scene, warnings } = loadScene(args)
      checkControls(scene, args)
      const report = simulateDay(scene, args)
      const unmetBy = Object.fromEntries(
        Object.entries(report.totals)
          .filter(([, t]) => (t.unmet ?? 0) > 1e-3)
          .map(([id, t]) => [id, t.unmet ?? 0]),
      )
      const result: Json = {
        sheet: scene.sheet,
        title: scene.title,
        start: report.start,
        alerts: report.alerts,
        totals: report.totals,
        unmet: unmetBy,
        warnings,
        ...(args.format === 'json'
          ? { rows: report.rows as unknown as Json[] }
          : {}),
      }
      if (args.format === 'json') return data(result)
      const alerts = report.alerts.length
        ? report.alerts
            .map(
              (a) =>
                `- ${a.text} — at ${a.hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')}`,
            )
            .join('\n')
        : 'none'
      const unmet = Object.entries(unmetBy).map(([id, u]) => `${id} ${u}`)
      return data(
        result,
        [
          `${scene.sheet} ${scene.title} — one day from ${String(scene.clock.start).padStart(2, '0')}:00`,
          '',
          reportTable(scene, report, args.parts),
          '',
          `alerts:\n${alerts}`,
          unmet.length
            ? `\nunmet demand over the day (rate × hours): ${unmet.join(', ')}`
            : '\nevery demand was met all day',
          warnings.length ? `\nwarnings:\n- ${warnings.join('\n- ')}` : '',
        ].join('\n'),
      )
    },
  ),
)

server.registerTool(
  'render_scene',
  {
    title: 'Draw the sheet',
    description:
      'Draw the sheet at an hour of the day, the same drawing the app shows in paper mode: every flow labelled with its value and direction. ' +
      'The scene runs from its opening hour first, so tanks and batteries show real levels. ' +
      'By default it comes back as a PNG image: look at it to check the layout (crossed lines, labels on top of each other, parts too close) and fix the scene. ' +
      'format svg returns the markup instead. With `out`, the drawing is saved to that .png or .svg path and only its details are returned.',
    inputSchema: {
      ...sceneInput,
      ...controlsInput,
      hour: z
        .number()
        .min(0)
        .max(24)
        .optional()
        .describe('hour of day to draw, e.g. 18.5; default the opening hour'),
      theme: z.enum(['light', 'dark']).optional(),
      labels: z
        .boolean()
        .optional()
        .describe('label every flow (default true)'),
      credit: z
        .boolean()
        .optional()
        .describe(
          'sign the bottom corner "Made with Anigram · Vaibhav Patel" (default true; false leaves it off)',
        ),
      format: z
        .enum(['png', 'svg'])
        .optional()
        .describe(
          'png (default) to look at; svg for the markup. With `out`, taken from its extension',
        ),
      width: z
        .number()
        .int()
        .min(MIN_PNG_WIDTH)
        .max(MAX_PNG_WIDTH)
        .optional()
        .describe(`PNG width in pixels, default ${PNG_WIDTH}`),
      out: z
        .string()
        .optional()
        .describe('save to this .png or .svg path instead of returning it'),
    },
    outputSchema: {
      hour: z.number().describe('the hour drawn'),
      format: z.enum(['png', 'svg']),
      bytes: z.number(),
      aspect: z.number().describe('width ÷ height'),
      width: z.number().optional().describe('PNG width in pixels'),
      height: z.number().optional().describe('PNG height in pixels'),
      saved: z.string().optional().describe('with `out`, the path written'),
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  guarded(
    async (args: {
      scene?: Json | string
      file?: string
      id?: string
      knobs?: Record<string, number>
      switches?: Record<string, boolean>
      hour?: number
      theme?: 'light' | 'dark'
      labels?: boolean
      credit?: boolean
      format?: 'png' | 'svg'
      width?: number
      out?: string
    }) => {
      const fromOut = args.out
        ? (extname(args.out).toLowerCase().slice(1) as 'png' | 'svg')
        : undefined
      if (fromOut && fromOut !== 'png' && fromOut !== 'svg')
        throw new Error(`${args.out}: expected a .png or .svg path`)
      if (fromOut && args.format && fromOut !== args.format)
        throw new Error(
          `format is ${args.format} but ${args.out} is a .${fromOut} path`,
        )
      const format = fromOut ?? args.format ?? 'png'
      const { scene } = loadScene(args)
      checkControls(scene, args)
      const svg = renderSheetSvg(scene, {
        hour: args.hour,
        theme: args.theme,
        annotate: args.labels ?? true,
        credit: args.credit,
        knobs: args.knobs,
        switches: args.switches,
      })
      const hour = args.hour ?? scene.clock.start
      const ratio = Number(aspect(scene))
      if (format === 'svg') {
        const info = { hour, format, bytes: svg.length, aspect: ratio }
        if (!args.out) return data(info, svg)
        const path = pathFor(args.out, '.svg')
        writeFile(path, svg)
        return data({ ...info, saved: path })
      }
      // check the path before the slow part
      const path = args.out ? pathFor(args.out, '.png') : undefined
      const png = await svgToPng(svg, args.width ?? PNG_WIDTH)
      const info = {
        hour,
        format,
        bytes: png.length,
        aspect: ratio,
        ...pngSize(png),
      }
      if (path) {
        writeFile(path, png)
        return data({ ...info, saved: path })
      }
      return image(png, info)
    },
  ),
)

server.registerTool(
  'share_link',
  {
    title: 'Open it live',
    description:
      'A link that opens the scene running live in the Anigram app — the whole scene travels in the URL, so nothing is uploaded. ' +
      'view: app (the workbench, default), embed (just the sheet, for an iframe), paper (frozen and labelled), screen (full-bleed wall view).',
    inputSchema: {
      ...sceneInput,
      view: z.enum(['app', 'embed', 'paper', 'screen']).optional(),
      hour: z.number().min(0).max(24).optional(),
      theme: z.enum(['light', 'dark']).optional(),
    },
    outputSchema: {
      url: z.string(),
      length: z.number().describe('characters in the url'),
      iframe: z
        .string()
        .optional()
        .describe('with view embed, a ready-to-paste iframe'),
    },
    annotations: { readOnlyHint: true },
  },
  guarded(
    async (args: {
      scene?: Json | string
      file?: string
      id?: string
      view?: 'app' | 'embed' | 'paper' | 'screen'
      hour?: number
      theme?: 'light' | 'dark'
    }) => {
      const url = new URL(APP_URL)
      const view = args.view ?? 'app'
      if (view === 'embed') url.searchParams.set('embed', '1')
      if (view === 'paper') url.searchParams.set('mode', 'paper')
      if (view === 'screen') url.searchParams.set('screen', '1')
      if (args.hour !== undefined) url.searchParams.set('t', String(args.hour))
      if (args.theme) url.searchParams.set('theme', args.theme)
      // a built-in sheet needs no payload
      if (args.id !== undefined && SCENES.some((s) => s.id === args.id)) {
        url.searchParams.set('scene', args.id)
        return data({ url: url.href, length: url.href.length })
      }
      const { scene } = loadScene(args)
      url.hash = `${HASH_KEY}=${await encodeScene(stamp(scene))}`
      const iframe =
        view === 'embed'
          ? `<iframe src="${url.href}" title="${scene.title.replace(/"/g, '&quot;')}" loading="lazy" style="width:100%;aspect-ratio:${aspect(scene)};border:0"></iframe>`
          : undefined
      return data({
        url: url.href,
        length: url.href.length,
        ...(iframe ? { iframe } : {}),
      })
    },
  ),
)

await server.connect(new StdioServerTransport())
