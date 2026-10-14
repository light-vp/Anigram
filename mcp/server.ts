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
 * names), and it only ever reads .json and .xml files and writes .json, .xml,
 * .svg, .png and .pdf.
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
import { checkExpectations, expectLines } from '../src/format/expect.ts'
import { effortTable, reportTable, simulateDay } from '../src/format/report.ts'
import { SCHEMA_URL, sceneSchema } from '../src/format/schema.ts'
import { encodeScene, HASH_KEY } from '../src/format/share.ts'
import { toDexpi } from '../src/format/dexpi.ts'
import { fromDexpi } from '../src/format/dexpiImport.ts'
import { fromSfiles, toSfiles } from '../src/format/sfiles.ts'
import { DOMAINS, DRAWINGS, validateScene } from '../src/format/validate.ts'
import { PRACTICE, STARTERS } from '../src/packs/starters.ts'
import { PART_KINDS } from '../src/parts/kinds.ts'
import { SCENES } from '../src/scenes/index.ts'
import { PACKS } from '../src/packs/catalogue.ts'
import { DRAWING_RULES, drawingFindings } from '../src/packs/checks.ts'
import { FUNCTION_LETTERS, MEASURED } from '../src/sim/instruments.ts'
import { FUNCTIONS, VARIABLES } from '../src/sim/expr.ts'
import type { DrawingType, Scene } from '../src/sim/types.ts'
import { sheetSize } from '../src/view/geometry.ts'
import { renderSheetSvg } from '../src/view/renderSvg.tsx'
import { svgToPdf } from './pdf.ts'
import type { Paper } from './pdf.ts'
import { svgToPng } from './png.ts'
import { autoLayout, withLayout } from '../src/view/autoLayout.ts'
import type { Direction } from '../src/view/autoLayout.ts'
import { lintLayout } from '../src/view/lint.ts'
import type { LayoutFinding } from '../src/view/lint.ts'

/** mcp/package.json's version, written in at build time */
declare const __ANIGRAM_MCP_VERSION__: string
const VERSION = __ANIGRAM_MCP_VERSION__

// answer --version and --help without starting the stdio server
const flag = process.argv[2]
if (flag === '--version' || flag === '-v') {
  console.log(VERSION)
  process.exit(0)
}
if (flag === '--help' || flag === '-h') {
  console.log(
    [
      `anigram-mcp ${VERSION}: the Anigram MCP server, over stdio.`,
      '',
      'Add it to an MCP client rather than running it by hand, e.g.',
      '  claude mcp add anigram -- npx -y anigram-mcp',
      '',
      'Settings (environment variables):',
      '  ANIGRAM_ALLOW_PATHS  more folders it may read and write, separated like PATH',
      '  ANIGRAM_APP_URL      the app share_link points at',
      '',
      'https://github.com/light-vp/Anigram/tree/main/mcp',
    ].join('\n'),
  )
  process.exit(0)
}
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
      'A drawing is a JSON scene file. Call anigram_guide first for the format. Then: write the file (write_scene) with an `expect` list stating its story, check_scene until every expectation holds (simulate_scene shows the hour-by-hour numbers when one fails), ' +
      'render_scene to look at it (a PNG by default: check the layout reads cleanly), and share_link to open it live in the browser. Built-in sheets (list_scenes / get_scene) are good starting points to copy. ' +
      "For an engineering drawing (a P&ID, a single-line diagram, a process flow diagram), start from new_scene with that `drawing`: it hands back a working starter and the practice's conventions. Before calling it done, run check_drawing (tags, line numbers, control loops, breakers, title block) and lint_layout (crossings, clashing labels); auto_layout lays a messy sheet out by its flow. export_dexpi hands a P&ID to plant design software; import_dexpi opens one from it, and import_sfiles / export_sfiles read and write a flowsheet in SFILES 2.0 notation. The draw-pid, draw-single-line, draw-pfd and draw-sheet prompts walk through the whole job.",
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

function pathFor(
  file: string,
  ext: '.json' | '.svg' | '.png' | '.pdf' | '.xml',
): string {
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
  const packs = Object.values(PACKS)
    .map(
      (pack) =>
        `### ${pack.name} (\`"drawing": "${pack.drawing}"\`)\n${pack.follows}.\n\n${Object.entries(
          pack.classes,
        )
          .map(([c, info]) => `- \`${c}\` — ${info.is}`)
          .join('\n')}`,
    )
    .join('\n\n')
  const isa = `First letter, what is measured: ${Object.entries(MEASURED)
    .map(([l, m]) => `${l} ${m}`)
    .join('; ')}.\n\nLater letters, what it does: ${Object.entries(
    FUNCTION_LETTERS,
  )
    .map(([l, m]) => `${l} ${m}`)
    .join('; ')}.`
  const rules = Object.entries(DRAWING_RULES)
    .map(([rule, r]) => `- \`${rule}\` (${r.practices.join(', ')}) — ${r.says}`)
    .join('\n')
  const body = guideText.replace(/^<!--.*-->\n/gm, '')
  return `${body}\nThe format as a JSON Schema: the \`anigram://schema/scene\` resource, or ${SCHEMA_URL} (put it in a file's \`$schema\` so editors check it).\n\n## Signal functions\n\n${vars}\n${fns}\n\n## Parts\n\n${kinds}\n\n## Engineering symbols\n\n${packs}\n\n### ISA-5.1 instrument letters\n\n${isa}\n\n### What check_drawing marks up\n\n${rules}\n\nDomains: ${DOMAINS.join(', ')}.\n`
}

// ---------------------------------------------------------------- output shapes

const checked = {
  ok: z.boolean().describe('true when the scene has no errors'),
  errors: z.array(z.string()).describe('problems that stop it loading'),
  warnings: z
    .array(z.string())
    .describe('things that will run but are probably not what you meant'),
}

const expectOutput = z.object({
  says: z.string(),
  check: z.string(),
  ok: z.boolean(),
  hours: z.array(z.number()).describe('the hours it was checked at'),
  failed: z.array(z.number()).describe('the hours it did not hold'),
  values: z
    .record(z.string(), z.number())
    .optional()
    .describe('what the parts it reads were doing at the first failure'),
})

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

const DRAWING_NAMES: Record<DrawingType, string> = {
  pictorial: 'a pictorial sheet',
  pid: 'a P&ID',
  'single-line': 'a single-line diagram',
  pfd: 'a process flow diagram',
}

server.registerTool(
  'new_scene',
  {
    title: 'Start a new sheet',
    description:
      'A small, working starter for a drawing practice: pictorial (the default), pid, single-line or pfd. It validates with no warnings and its `expect` list holds, ' +
      "and it shows the practice's conventions (tags, classes, instruments, title block). Edit it into the system you were asked for. With `file`, it is also saved there.",
    inputSchema: {
      drawing: z
        .enum(DRAWINGS as [DrawingType, ...DrawingType[]])
        .optional()
        .describe('the drawing practice; default pictorial'),
      id: z
        .string()
        .optional()
        .describe('the new scene id, lowercase-and-dashes'),
      title: z.string().optional(),
      file: z
        .string()
        .optional()
        .describe('save the starter to this .json path as well'),
    },
    outputSchema: {
      drawing: z.string(),
      practice: z.string().describe("the practice's conventions"),
      scene: sceneOutput,
      saved: z.string().optional(),
    },
    annotations: { idempotentHint: true },
  },
  guarded(
    (args: {
      drawing?: DrawingType
      id?: string
      title?: string
      file?: string
    }) => {
      const drawing = args.drawing ?? 'pictorial'
      const scene = {
        $schema: SCHEMA_URL,
        ...structuredClone(STARTERS[drawing]),
        ...(args.id ? { id: args.id } : {}),
        ...(args.title ? { title: args.title } : {}),
      }
      const result: Json = {
        drawing,
        practice: PRACTICE[drawing],
        scene: scene as Json,
      }
      if (args.file) {
        const path = pathFor(args.file, '.json')
        writeFile(path, `${JSON.stringify(scene, null, 2)}\n`)
        result.saved = path
      }
      return data(result)
    },
  ),
)

// one prompt per practice: the conventions, then the way to work
for (const drawing of DRAWINGS) {
  const what = DRAWING_NAMES[drawing]
  const pack = PACKS[drawing]
  server.registerPrompt(
    drawing === 'pictorial' ? 'draw-sheet' : `draw-${drawing}`,
    {
      title: `Draw ${what}`,
      description: `Draw ${what} of a system with Anigram${pack ? `, following ${pack.follows}` : ''}.`,
      argsSchema: {
        brief: z
          .string()
          .describe('the system to draw, in a sentence or a paragraph'),
      },
    },
    ({ brief }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Draw ${what} with Anigram: ${brief}`,
              '',
              PRACTICE[drawing],
              '',
              'Work like this:',
              `1. Call new_scene with drawing "${drawing}" for a starter that already works, and anigram_guide for the format${pack ? ` and the ${pack.name} classes` : ''}.`,
              "2. Replace the starter's parts, links" +
                (drawing === 'pid' ? ', instruments' : '') +
                ' and `expect` list with the system in the brief, keeping its conventions. Save it with write_scene.',
              drawing === 'pictorial'
                ? '3. Run check_scene until every expectation holds and no warnings are left.'
                : '3. Run check_scene until every expectation holds and no warnings are left, then check_drawing until it has nothing to mark up.',
              '4. render_scene and look at the PNG: fix crossed lines, crowded labels and anything missing a tag.',
              drawing === 'pictorial'
                ? '5. share_link to open it live.'
                : '5. render_scene to a .pdf path for a print on A3 paper, and share_link to open it live.',
            ].join('\n'),
          },
        },
      ],
    }),
  )
}

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
      'events',
      'expect',
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
      'Run the scene headless through 24 hours from its opening hour and report what every part did, hour by hour, every alert (a demand going short, a store running empty, a link at its limit, a pressure or voltage outside its rating), the hours each event in its chain fired, and the day’s totals. ' +
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
      events: z
        .array(
          z.object({
            id: z.string(),
            says: z.string(),
            hours: z.array(z.number()),
          }),
        )
        .optional()
        .describe("the scene's event chain: the hours each event fired in"),
      expect: z
        .array(expectOutput)
        .describe("the scene's `expect` checks against this day"),
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
      const stories = checkExpectations(scene, report, args)
      const result: Json = {
        sheet: scene.sheet,
        title: scene.title,
        start: report.start,
        alerts: report.alerts,
        totals: report.totals,
        unmet: unmetBy,
        ...(report.events ? { events: report.events } : {}),
        expect: stories,
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
      const efforts = effortTable(scene, report)
      const chain = report.events
        ? scene.events!.map((e) => {
            const hours = report.events!.find((x) => x.id === e.id)?.hours ?? []
            return `- ${e.id}: ${e.says} — ${hours.length ? `fired at ${hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')}` : 'never fired'}`
          })
        : []
      return data(
        result,
        [
          `${scene.sheet} ${scene.title} — one day from ${String(scene.clock.start).padStart(2, '0')}:00`,
          '',
          reportTable(scene, report, args.parts),
          efforts ? `\neffort:\n${efforts}` : '',
          chain.length ? `\nevents:\n${chain.join('\n')}` : '',
          '',
          `alerts:\n${alerts}`,
          unmet.length
            ? `\nunmet demand over the day (rate × hours): ${unmet.join(', ')}`
            : '\nevery demand was met all day',
          stories.length
            ? `\nexpect (${stories.filter((r) => r.ok).length} of ${stories.length} hold):\n${expectLines(stories)}`
            : '',
          warnings.length ? `\nwarnings:\n- ${warnings.join('\n- ')}` : '',
        ].join('\n'),
      )
    },
  ),
)

server.registerTool(
  'check_scene',
  {
    title: 'Check a scene tells its story',
    description:
      "One call for 'is it done?': validate the scene, run its day, and check every line of its `expect` list. " +
      'ok is true only when the scene is valid and every expectation holds. Use it after each change; when one fails, the result says at which hours and what the parts it reads were doing. ' +
      'Warnings include physics: a machine made from nothing, a converter over 100% efficient, a round trip that comes back bigger. Fix those too, or the story only holds on paper. ' +
      'A scene with no `expect` list passes with a reminder to add one.',
    inputSchema: { ...sceneInput, ...controlsInput },
    outputSchema: {
      ...checked,
      ok: z
        .boolean()
        .describe('valid, and every expectation holds under these controls'),
      expect: z.array(expectOutput),
      alerts: z.array(
        z.object({ text: z.string(), hours: z.array(z.number()) }),
      ),
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
    }) => {
      const v = validateScene(rawScene(args))
      if (!v.scene) {
        const result = {
          ok: false,
          errors: v.errors,
          warnings: v.warnings,
          expect: [],
          alerts: [],
        }
        return data(
          result,
          `not valid — ${v.errors.length} error(s):\n- ${v.errors.join('\n- ')}`,
        )
      }
      const scene = v.scene
      checkControls(scene, args)
      const report = simulateDay(scene, args)
      const stories = checkExpectations(scene, report, args)
      const ok = stories.every((r) => r.ok)
      const result = {
        ok,
        errors: v.errors,
        warnings: v.warnings,
        expect: stories,
        alerts: report.alerts,
      }
      const head = !stories.length
        ? 'valid, but there is no `expect` list to check: add one line per claim the sheet makes (see the guide)'
        : ok
          ? `all ${stories.length} expectations hold`
          : `${stories.filter((r) => !r.ok).length} of ${stories.length} expectations fail`
      return data(
        result,
        [
          head,
          stories.length ? expectLines(stories) : '',
          v.warnings.length ? `warnings:\n- ${v.warnings.join('\n- ')}` : '',
          practiceNote(scene),
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
    },
  ),
)

/** a one-line pointer from check_scene to check_drawing, when the sheet has notes */
function practiceNote(scene: Scene): string {
  const n = drawingFindings(scene).length
  return n
    ? `${n} drawing-practice note(s) on this sheet (${DRAWING_NAMES[scene.drawing!]}): check_drawing lists them with fixes`
    : ''
}

server.registerTool(
  'check_drawing',
  {
    title: "Check a sheet against its practice's rules",
    description:
      "For an engineering drawing (pid, single-line, pfd): what an engineer reviewing the sheet would mark up. Every equipment item tagged in the practice's scheme (ISA letters on a P&ID, IEC 81346 on a single-line), " +
      'lines and streams numbered, control valves driven by a controller and loops sharing a number, feeders and generators behind a breaker, the title block filled. ' +
      'Each finding names its rule and says how to fix it. Advisory by default: ok stays true. With `strict` (for CI and print-ready sheets), ok is false while any finding is left. ' +
      'A pictorial sheet has no practice rules and passes.',
    inputSchema: {
      ...sceneInput,
      strict: z
        .boolean()
        .optional()
        .describe('make every finding a failure; default false'),
    },
    outputSchema: {
      ok: z.boolean().describe('valid, and (when strict) no findings'),
      drawing: z.string(),
      strict: z.boolean(),
      errors: z.array(z.string()),
      findings: z.array(
        z.object({ rule: z.string(), path: z.string(), message: z.string() }),
      ),
    },
    annotations: { readOnlyHint: true },
  },
  guarded(
    (args: {
      scene?: Json | string
      file?: string
      id?: string
      strict?: boolean
    }) => {
      const v = validateScene(rawScene(args))
      const strict = !!args.strict
      const drawing = v.scene?.drawing ?? 'pictorial'
      const findings = v.scene ? drawingFindings(v.scene) : []
      const ok = !!v.scene && (!strict || findings.length === 0)
      const head = !v.scene
        ? `not valid — ${v.errors.length} error(s):\n- ${v.errors.join('\n- ')}`
        : drawing === 'pictorial'
          ? 'a pictorial sheet: no drawing-practice rules to check (set `drawing` to pid, single-line or pfd)'
          : findings.length
            ? `${findings.length} finding(s) on this sheet (${DRAWING_NAMES[drawing]})${strict ? '; strict, so each one fails the check' : ''}:`
            : `nothing to mark up: this sheet follows the practice of ${DRAWING_NAMES[drawing]}`
      return data(
        { ok, drawing, strict, errors: v.errors, findings },
        [
          head,
          ...findings.map((f) => `- [${f.rule}] ${f.path}: ${f.message}`),
        ].join('\n'),
      )
    },
  ),
)

const layoutFinding = z.object({
  rule: z.string(),
  path: z.string(),
  message: z.string(),
})

function lintText(findings: LayoutFinding[]): string {
  return findings.length
    ? `${findings.length} layout finding(s):\n${findings.map((f) => `- [${f.rule}] ${f.path}: ${f.message}`).join('\n')}`
    : 'the layout reads cleanly: no crossings, overlaps, lines through parts or labels on top of each other'
}

server.registerTool(
  'lint_layout',
  {
    title: 'Check the sheet reads cleanly',
    description:
      "Check the drawing's geometry without rendering it: lines that cross or run on top of each other, a line through a part that is not one of its ends, slanted runs, labels landing on parts or other labels, and labels running off the edge of the sheet. " +
      'Each finding says what to move. Engineering sheets are checked as they draw (only the lines the practice shows, busbars tapped where their feeders are). auto_layout fixes most of these at once.',
    inputSchema: sceneInput,
    outputSchema: {
      ok: z.boolean().describe('valid, with no layout findings'),
      errors: z.array(z.string()),
      findings: z.array(layoutFinding),
    },
    annotations: { readOnlyHint: true },
  },
  guarded((args: { scene?: Json | string; file?: string; id?: string }) => {
    const v = validateScene(rawScene(args))
    if (!v.scene)
      return data(
        { ok: false, errors: v.errors, findings: [] },
        `not valid — ${v.errors.length} error(s):\n- ${v.errors.join('\n- ')}`,
      )
    const findings = lintLayout(v.scene)
    return data(
      { ok: findings.length === 0, errors: v.errors, findings },
      lintText(findings),
    )
  }),
)

server.registerTool(
  'auto_layout',
  {
    title: 'Lay the sheet out by its flow',
    description:
      'Place every part on the grid by how things flow, as a drafter would: sources first, each step one column on, lines straight where they can be and turning square where they cannot, long links routed through empty cells, and P&ID instruments a row above what they serve. ' +
      'Single-line diagrams run top to bottom (supply at the top, feeders dropping off the busbars, loads at the bottom); everything else runs left to right, or set `direction`. ' +
      'It rewrites `at`, `via`, `bend`, `labelSide`, instrument cells and `size`, and nothing else. With `file`, the file is updated in place. Returns the scene and a lint_layout of the result; nudge anything it leaves with edit_scene.',
    inputSchema: {
      ...sceneInput,
      direction: z
        .enum(['right', 'down'])
        .optional()
        .describe(
          'which way the flow runs; default down for a single-line, right otherwise',
        ),
    },
    outputSchema: {
      direction: z.string(),
      moved: z.array(z.string()).describe('the parts that changed cell'),
      scene: sceneOutput,
      findings: z.array(layoutFinding),
      saved: z.string().optional(),
    },
  },
  guarded(
    (args: {
      scene?: Json | string
      file?: string
      id?: string
      direction?: Direction
    }) => {
      const raw = rawScene(args) as Json
      const { scene } = loadScene({ scene: structuredClone(raw) })
      const laid = autoLayout(scene, args.direction)
      // write the new geometry into the scene as given, so nothing else changes
      const out = withLayout(raw, laid.scene)
      const findings = lintLayout(laid.scene)
      const result: Json = {
        direction: laid.direction,
        moved: laid.moved,
        scene: out,
        findings,
      }
      if (args.file) {
        const path = pathFor(args.file, '.json')
        writeFile(path, `${JSON.stringify(out, null, 2)}\n`)
        result.saved = path
      }
      return data(
        result,
        [
          `laid out ${laid.direction === 'down' ? 'top to bottom' : 'left to right'} on a ${laid.scene.size.join('×')} grid; ${laid.moved.length} part(s) moved${result.saved ? `; saved to ${String(result.saved)}` : ''}`,
          lintText(findings),
          JSON.stringify(out, null, 2),
        ].join('\n\n'),
      )
    },
  ),
)

server.registerTool(
  'export_dexpi',
  {
    title: 'Export a P&ID as DEXPI',
    description:
      'Write a P&ID (`"drawing": "pid"`) as DEXPI 1.3 Proteus XML, the exchange format plant design software reads: equipment with its tags and nozzles, each numbered line as a piping system with its valves in place, off-page connectors, and the instrument loops (measuring, control, actuated valves). ' +
      'It carries the plant, not the picture: positions are in millimetres on A3, and the receiving tool draws its own symbols. With `out` (a .xml path) the file is saved and only a summary comes back. ' +
      'notes say what could not go across (a part with no DEXPI class, a valve outside any pipe); run check_drawing first so every item is tagged and every line numbered.',
    inputSchema: {
      ...sceneInput,
      out: z.string().optional().describe('save the XML to this .xml path'),
    },
    outputSchema: {
      counts: z.object({
        equipment: z.number(),
        lines: z.number(),
        segments: z.number(),
        instruments: z.number(),
        loops: z.number(),
      }),
      notes: z.array(z.string()),
      saved: z.string().optional(),
      bytes: z.number(),
    },
    annotations: { readOnlyHint: false },
  },
  guarded(
    (args: {
      scene?: Json | string
      file?: string
      id?: string
      out?: string
    }) => {
      const { scene } = loadScene(args)
      const r = toDexpi(scene, { version: VERSION })
      const result: Json = {
        counts: r.counts,
        notes: r.notes,
        bytes: Buffer.byteLength(r.xml),
      }
      if (args.out) {
        const path = pathFor(args.out, '.xml')
        writeFile(path, r.xml)
        result.saved = path
      }
      const c = r.counts
      const head = `DEXPI 1.3 (Proteus 4.1.1): ${c.equipment} equipment, ${c.lines} line(s) in ${c.segments} segment(s), ${c.instruments} instrument(s) in ${c.loops} loop(s)${result.saved ? `; saved to ${String(result.saved)}` : ''}`
      return data(
        result,
        [
          head,
          r.notes.length ? `notes:\n- ${r.notes.join('\n- ')}` : '',
          args.out ? '' : r.xml,
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
    },
  ),
)

const importOutput = {
  notes: z.array(z.string()),
  scene: sceneOutput
    .optional()
    .describe('the scene, when it was not saved to `out`'),
  saved: z.string().optional(),
}

/** an imported scene: saved to `out`, or handed back whole */
function imported(
  scene: Scene,
  notes: string[],
  head: string,
  extra: Json,
  out: string | undefined,
): Result {
  const v = validateScene(structuredClone(scene))
  const result: Json = { ...extra, notes, ...(out ? {} : { scene }) }
  if (out) {
    const path = pathFor(out, '.json')
    writeFile(path, `${JSON.stringify(scene, null, 2)}\n`)
    result.saved = path
  }
  const issues = [...v.errors, ...v.warnings]
  return data(
    result,
    [
      `${head}${result.saved ? `; saved to ${String(result.saved)}` : ''}`,
      notes.length ? `notes:\n- ${notes.join('\n- ')}` : '',
      issues.length ? `validation:\n- ${issues.join('\n- ')}` : '',
      out ? '' : JSON.stringify(scene, null, 2),
    ]
      .filter(Boolean)
      .join('\n\n'),
  )
}

server.registerTool(
  'import_dexpi',
  {
    title: 'Open a DEXPI P&ID',
    description:
      'Turn a DEXPI 1.3 (Proteus XML) P&ID from plant design software into a living P&ID scene: equipment with its tags, each piping segment as lines from nozzle to nozzle with its valves in place, off-page connectors as where flow enters and leaves, and the instrument loops with the valves they drive. Flanges and reducers are passed through. ' +
      'Behaviours are guessed from each class (a pump passes up to its duty and can be stopped, a hand valve can be shut, a control valve follows a slider, a tank stores) and the notes say so: set real duties, then add an `expect` list and run check_scene. ' +
      'Give `file` (a .xml path) or the XML itself; with `out` (a .json path) the scene is saved and not echoed back.',
    inputSchema: {
      file: z.string().optional().describe('path to a DEXPI .xml file'),
      xml: z.string().optional().describe('the DEXPI XML itself'),
      layout: z
        .enum(['drawing', 'flow'])
        .optional()
        .describe(
          "`drawing` keeps the file's own arrangement, `flow` lays it out by its flow; by default whichever reads more cleanly",
        ),
      sceneId: z.string().optional().describe("the new scene's id"),
      out: z.string().optional().describe('save the scene to this .json path'),
    },
    outputSchema: {
      counts: z.object({
        equipment: z.number(),
        valves: z.number(),
        lines: z.number(),
        instruments: z.number(),
        fittings: z.number(),
      }),
      ...importOutput,
    },
    annotations: { readOnlyHint: false },
  },
  guarded(
    (args: {
      file?: string
      xml?: string
      layout?: 'drawing' | 'flow'
      sceneId?: string
      out?: string
    }) => {
      if (!!args.file === !!args.xml)
        throw new Error(
          'give the DEXPI file as `file` or as `xml`, one of them',
        )
      const src = args.file
        ? readFileSync(pathFor(args.file, '.xml'), 'utf8')
        : args.xml!
      const r = fromDexpi(src, { id: args.sceneId, layout: args.layout })
      const c = r.counts
      return imported(
        r.scene,
        r.notes,
        `"${r.scene.title}": ${c.equipment} equipment, ${c.valves} valve(s), ${c.lines} line(s), ${c.instruments} instrument(s), ${c.fittings} fitting(s) passed through, on a ${r.scene.size.join('×')} grid`,
        { counts: c },
        args.out,
      )
    },
  ),
)

server.registerTool(
  'import_sfiles',
  {
    title: 'Open an SFILES 2.0 flowsheet',
    description:
      'Turn an SFILES 2.0 string, the line notation for flowsheets, into a living process flow diagram laid out by its flow: `(raw)(pp)(hex)(r)[(prod)](dist){tout}(prod)`. ' +
      'Units are `(raw)` feed, `(prod)` product, `(pp)` pump, `(comp)` compressor, `(hex)` heat exchanger, `(r)` reactor, `(dist)` column, `(flash)` flash drum, `(tank)`, `(v)` valve, `(mix)`/`(splt)`, `(lfil)` filter and the rest of the OntoCape set; `[...]` branches, `<&|...&|` flows in, digits and `<digit` are recycles. ' +
      'Major equipment gets tags (P-101, E-101, C-101), behaviours are guessed as for a DEXPI import, and control units are left out. With `out` (a .json path) the scene is saved and not echoed back.',
    inputSchema: {
      sfiles: z.string().describe('the SFILES 2.0 string'),
      title: z.string().optional().describe("the sheet's title"),
      sceneId: z.string().optional().describe("the new scene's id"),
      drawing: z
        .enum(['pfd', 'pid'])
        .optional()
        .describe('pfd (the default), or pid to draw the valves too'),
      out: z.string().optional().describe('save the scene to this .json path'),
    },
    outputSchema: {
      counts: z.object({
        units: z.number(),
        streams: z.number(),
        recycles: z.number(),
        controls: z.number(),
      }),
      ...importOutput,
    },
    annotations: { readOnlyHint: false },
  },
  guarded(
    (args: {
      sfiles: string
      title?: string
      sceneId?: string
      drawing?: 'pfd' | 'pid'
      out?: string
    }) => {
      const r = fromSfiles(args.sfiles, {
        id: args.sceneId,
        title: args.title,
        drawing: args.drawing,
      })
      const c = r.counts
      return imported(
        r.scene,
        r.notes,
        `${c.units} unit(s), ${c.streams} stream(s), ${c.recycles} recycle(s) on a ${r.scene.size.join('×')} grid`,
        { counts: c },
        args.out,
      )
    },
  ),
)

server.registerTool(
  'export_sfiles',
  {
    title: 'Write a flowsheet as SFILES 2.0',
    description:
      "Write a scene's process streams (water, heat and fuel; not power, signals or losses) as an SFILES 2.0 string, the line notation flowsheet tools and machine-learning datasets read. " +
      'Each part becomes a unit by its class, then its label (a "Reactor", a "Flash drum"), then its role: sources are `(raw)`, sinks `(prod)`. Branches, recycles and feeds joining the main line are written the way the notation does.',
    inputSchema: sceneInput,
    outputSchema: {
      sfiles: z.string(),
      notes: z.array(z.string()),
    },
  },
  guarded((args: { scene?: Json | string; file?: string; id?: string }) => {
    const { scene } = loadScene(args)
    const r = toSfiles(scene)
    return data(
      { sfiles: r.sfiles, notes: r.notes },
      [r.sfiles, r.notes.length ? `notes:\n- ${r.notes.join('\n- ')}` : '']
        .filter(Boolean)
        .join('\n\n'),
    )
  }),
)

server.registerTool(
  'render_scene',
  {
    title: 'Draw the sheet',
    description:
      'Draw the sheet at an hour of the day, the same drawing the app shows in paper mode: every flow labelled with its value and direction. ' +
      'The scene runs from its opening hour first, so tanks and batteries show real levels. ' +
      'By default it comes back as a PNG image: look at it to check the layout (crossed lines, labels on top of each other, parts too close) and fix the scene. ' +
      'format svg returns the markup instead. With `out`, the drawing is saved to that .png, .svg or .pdf path and only its details are returned. ' +
      'A PDF is one landscape page of ISO A paper (A3 unless `paper` says otherwise) for printing and filing; an engineering drawing carries its title block. A PDF needs `out`.',
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
        .enum(['png', 'svg', 'pdf'])
        .optional()
        .describe(
          'png (default) to look at; svg for the markup; pdf to print. With `out`, taken from its extension',
        ),
      paper: z
        .enum(['A4', 'A3', 'A2', 'A1'])
        .optional()
        .describe('the PDF page, landscape; default A3'),
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
        .describe(
          'save to this .png, .svg or .pdf path instead of returning it',
        ),
    },
    outputSchema: {
      hour: z.number().describe('the hour drawn'),
      format: z.enum(['png', 'svg', 'pdf']),
      bytes: z.number(),
      paper: z.string().optional().describe('the PDF page size'),
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
      format?: 'png' | 'svg' | 'pdf'
      paper?: Paper
      width?: number
      out?: string
    }) => {
      const fromOut = args.out
        ? (extname(args.out).toLowerCase().slice(1) as 'png' | 'svg' | 'pdf')
        : undefined
      if (fromOut && !['png', 'svg', 'pdf'].includes(fromOut))
        throw new Error(`${args.out}: expected a .png, .svg or .pdf path`)
      if (fromOut && args.format && fromOut !== args.format)
        throw new Error(
          `format is ${args.format} but ${args.out} is a .${fromOut} path`,
        )
      const format = fromOut ?? args.format ?? 'png'
      if (format === 'pdf' && !args.out)
        throw new Error(
          'a PDF is saved to a file: give `out`, a .pdf path such as "sheet.pdf"',
        )
      if (args.paper && format !== 'pdf')
        throw new Error(
          'paper sets the PDF page; it does nothing for png or svg',
        )
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
      if (format === 'pdf') {
        const path = pathFor(args.out!, '.pdf')
        const paper = args.paper ?? 'A3'
        const { pdf } = await svgToPdf(svg, ratio, paper, {
          title: `${scene.sheet} ${scene.title}`,
          author: scene.titleBlock?.drawnBy ?? scene.titleBlock?.owner,
          subject: scene.subtitle || undefined,
        })
        writeFile(path, pdf)
        return data({
          hour,
          format,
          bytes: pdf.length,
          aspect: ratio,
          paper,
          saved: path,
        })
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
      view: z.enum(['app', 'embed', 'paper', 'screen', 'editor']).optional(),
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
      view?: 'app' | 'embed' | 'paper' | 'screen' | 'editor'
      hour?: number
      theme?: 'light' | 'dark'
    }) => {
      const url = new URL(APP_URL)
      const view = args.view ?? 'app'
      if (view === 'embed') url.searchParams.set('embed', '1')
      if (view === 'paper') url.searchParams.set('mode', 'paper')
      if (view === 'screen') url.searchParams.set('screen', '1')
      if (view === 'editor') url.searchParams.set('build', '1')
      if (args.hour !== undefined) url.searchParams.set('t', String(args.hour))
      if (args.theme) url.searchParams.set('theme', args.theme)
      // a built-in sheet needs no payload
      if (args.id !== undefined && SCENES.some((s) => s.id === args.id)) {
        url.searchParams.set('scene', args.id)
        return data({ url: url.href, length: url.href.length })
      }
      const { scene } = loadScene(args)
      // the editor gets the file as written, so saving it back changes only what the person did
      const sent = view === 'editor' ? (rawScene(args) as Json) : scene
      url.hash = `${HASH_KEY}=${await encodeScene(stamp(sent))}`
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
