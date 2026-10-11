// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { DOMAINS, LINE_TYPES, MOUNTINGS } from '../format/validate.ts'
import { classOf } from '../packs/catalogue.ts'
import type { Frame } from '../sim/runtime.ts'
import type {
  Behaviour,
  Domain,
  DrawingType,
  InstrumentSpec,
  LabelSide,
  LineType,
  PartSpec,
  Scene,
  TitleBlock,
} from '../sim/types.ts'
import { details } from '../view/format.ts'
import { DOMAIN_NAMES } from '../view/palette.ts'
import {
  flipLink,
  patchBehaviour,
  patchInstrument,
  patchLink,
  patchPart,
  patchSheet,
  removeInstrument,
  removeLink,
  removePart,
  renamePart,
  rerouteLink,
  setSwitch,
} from './doc.ts'
import type { Doc } from './doc.ts'
import type { Selection } from './selection.ts'
import { classesFor, nextLineNumber, spaced } from './practice.ts'
import { SignalField } from './SignalField.tsx'
import { PROFILES, TEMPLATES, dialOf, fmt, profileOf } from './templates.ts'
import type { ProfileId } from './templates.ts'
import styles from './Editor.module.css'

/*
 * The side panel: whatever is selected, with every field the scene file has
 * for it. Text fields write when you leave them (or press Enter), so typing
 * a label is one step of undo, not one per key.
 */

export interface EditProps {
  doc: Doc
  edit: (next: Doc) => void
  select: (s: Selection | null) => void
  say: (note: string) => void
}

// ---------------------------------------------------------------- fields

/** a text field that writes on blur or Enter */
function Text({
  label,
  value,
  onCommit,
  placeholder,
  className,
  big,
}: {
  label: string
  value: string | undefined
  onCommit: (v: string) => void
  placeholder?: string
  className?: string
  big?: boolean
}) {
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  const commit = () => text !== (value ?? '') && onCommit(text)
  const input = (
    <input
      className={big ? styles.nameInput : (className ?? styles.input)}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
  if (big) return input
  return (
    <label className={styles.fieldRow}>
      <span>{label}</span>
      {input}
    </label>
  )
}

function NumberField({
  label,
  value,
  onCommit,
  min,
  step,
  optional,
}: {
  label: string
  value: number | undefined
  onCommit: (v: number | undefined) => void
  min?: number
  step?: number
  optional?: boolean
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => setText(value === undefined ? '' : String(value)), [value])
  const n = Number(text)
  const ok =
    (optional && text.trim() === '') ||
    (text.trim() !== '' &&
      Number.isFinite(n) &&
      (min === undefined || n >= min))
  return (
    <label className={styles.fieldRow}>
      <span>{label}</span>
      <input
        className={ok ? styles.input : `${styles.input} ${styles.exprBad}`}
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        step={step ?? 'any'}
        aria-invalid={!ok}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!ok) return
          const v = text.trim() === '' ? undefined : n
          if (v !== value) onCommit(v)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  none,
}: {
  label: string
  value: T | undefined
  options: ReadonlyArray<T | readonly [T, string]>
  onChange: (v: T | undefined) => void
  /** the label for leaving it unset, when that is allowed */
  none?: string
}) {
  return (
    <label className={styles.fieldRow}>
      <span>{label}</span>
      <select
        className={styles.select}
        value={value ?? ''}
        onChange={(e) =>
          onChange((e.target.value || undefined) as T | undefined)
        }
      >
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => {
          const [v, l] = typeof o === 'string' ? [o, o] : o
          return (
            <option key={v} value={v}>
              {l}
            </option>
          )
        })}
      </select>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className={styles.subhead}>{title}</h3>
      {children}
    </>
  )
}

// ---------------------------------------------------------------- a part

/** the field a part's size lives in, for its slider */
function sizeField(b: Behaviour): string | undefined {
  if (b.role === 'source') return 'output'
  if (b.role === 'sink') return 'demand'
  if (b.role === 'converter' || b.role === 'storage') return 'capacity'
  return undefined
}

const SIGNALS: Record<string, Array<[string, string]>> = {
  source: [['output', 'output']],
  sink: [['demand', 'demand']],
  gate: [['open', 'open (0 to 1)']],
  storage: [
    ['maxIn', 'fastest it fills'],
    ['maxOut', 'fastest it empties'],
  ],
}

export function PartPanel({
  doc,
  edit,
  select,
  say,
  part,
  scene,
  frame,
  linking,
  onConnect,
}: EditProps & {
  part: PartSpec
  scene: Scene
  frame: Frame
  linking: boolean
  onConnect: () => void
}) {
  const t = TEMPLATES.get(part.kind)
  const b = part.behaviour
  const drawing = doc.drawing
  const eng = !!drawing && drawing !== 'pictorial'
  const sw = (doc.switches ?? []).find((w) => w.id === part.toggles)
  const field = sizeField(b)
  const raw = field
    ? (b as unknown as Record<string, unknown>)[field]
    : undefined
  const dial = dialOf(raw)
  const profile = dial ? profileOf(dial.shape) : undefined
  const max = t?.size?.max ?? Math.max(10, (dial?.size ?? 1) * 4)
  const [size, setSize] = useState(dial?.size ?? 0)
  useEffect(() => setSize(dial?.size ?? 0), [dial?.size])
  const sized = (n: number) => (dial?.shape ? `${fmt(n)} * ${dial.shape}` : n)
  const state = frame.parts[part.id]
  const scenePart = scene.parts.find((p) => p.id === part.id)
  const unit = t?.size?.unit ?? ''

  // one row per neighbour: a charge/discharge pair reads as one wire
  const wires = doc.links
    .map((l, i) => ({ l, i }))
    .filter(
      ({ l }) =>
        (l.from === part.id || l.to === part.id) &&
        !(
          l.to === part.id &&
          doc.links.some(
            (x) =>
              x.from === part.id && x.to === l.from && x.domain === l.domain,
          )
        ),
    )

  return (
    <section className={styles.card} aria-label={`${part.label} settings`}>
      <p className={styles.kicker}>
        {eng
          ? spaced(classOf(part, doc) ?? 'no symbol')
          : (t?.name ?? part.kind)}
      </p>
      <Text
        big
        label="Label"
        value={part.label}
        onCommit={(label) =>
          label.trim() && edit(patchPart(doc, part.id, { label }))
        }
      />
      {part.note && <p className={styles.p}>{part.note}</p>}

      {field && dial && (
        <label className={styles.knob}>
          <span className={styles.knobHead}>
            <span>{t?.size?.label ?? field}</span>
            <output>
              {size} {unit}
            </output>
          </span>
          <input
            type="range"
            min={0}
            max={max}
            step={max > 100 ? 5 : max > 20 ? 1 : 0.1}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            onPointerUp={() =>
              size !== dial.size &&
              edit(patchBehaviour(doc, part.id, { [field]: sized(size) }))
            }
            onKeyUp={() =>
              size !== dial.size &&
              edit(patchBehaviour(doc, part.id, { [field]: sized(size) }))
            }
          />
        </label>
      )}

      {field && dial && profile && t?.profiles && t.profiles.length > 1 && (
        <Choice
          label="over the day"
          value={profile}
          options={t.profiles.map((id) => [id, PROFILES[id].label] as const)}
          onChange={(p) =>
            p &&
            edit(
              patchBehaviour(doc, part.id, {
                [field]: PROFILES[p as ProfileId].shape
                  ? `${fmt(dial.size)} * ${PROFILES[p as ProfileId].shape}`
                  : dial.size,
              }),
            )
          }
        />
      )}

      {sw && (
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={sw.on}
            onChange={() => edit(setSwitch(doc, sw.id, !sw.on))}
          />
          <span>
            {t?.switch ? (sw.on ? t.switch.on : t.switch.off) : sw.label}
          </span>
        </label>
      )}

      {eng && (
        <Section title="On the drawing">
          <Text
            label="tag"
            value={part.tag}
            placeholder={drawing === 'single-line' ? '-Q1' : 'P-101'}
            onCommit={(tag) =>
              edit(patchPart(doc, part.id, { tag: tag.trim() || undefined }))
            }
          />
          <Choice
            label="symbol"
            value={part.class}
            none={`from its kind (${classOf({ ...part, class: undefined }, doc) ?? 'a box'})`}
            options={classesFor(drawing)}
            onChange={(c) => edit(patchPart(doc, part.id, { class: c }))}
          />
        </Section>
      )}
      <Choice<LabelSide>
        label="label"
        value={part.labelSide}
        none="below"
        options={['above', 'left', 'right']}
        onChange={(s) => edit(patchPart(doc, part.id, { labelSide: s }))}
      />
      <Text
        label="id"
        value={part.id}
        onCommit={(to) => {
          const r = renamePart(doc, part.id, to.trim())
          if ('error' in r) return say(r.error)
          edit(r.doc)
          select({ kind: 'part', id: to.trim() })
        }}
      />

      <Section title="Behaviour">
        <BehaviourFields doc={doc} edit={edit} part={part} />
      </Section>

      <Section title="Wiring">
        {wires.length === 0 && <p className={styles.p}>Not connected yet.</p>}
        <ul className={styles.wires}>
          {wires.map(({ l, i }) => {
            const otherId = l.from === part.id ? l.to : l.from
            const other = doc.parts.find((p) => p.id === otherId)
            const both = doc.links.some(
              (x) =>
                x.from === l.to && x.to === l.from && x.domain === l.domain,
            )
            const arrow = both ? '⇄' : l.from === part.id ? '→' : '←'
            return (
              <li key={i}>
                <button
                  type="button"
                  className={styles.wireName}
                  onClick={() => select({ kind: 'link', index: i })}
                >
                  {arrow} {other?.label ?? otherId}{' '}
                  <span className={styles.muted}>
                    · {DOMAIN_NAMES[l.domain]}
                  </span>
                </button>
                <span className={styles.wireTools}>
                  <button
                    type="button"
                    title="Disconnect"
                    aria-label={`Disconnect ${other?.label ?? otherId}`}
                    onClick={() => edit(removeLink(doc, i))}
                  >
                    ✕
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.tool}
          aria-pressed={linking}
          onClick={onConnect}
        >
          connect to…
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={() => {
            edit(removePart(doc, part.id))
            select(null)
          }}
        >
          remove
        </button>
      </div>

      {state && scenePart && (
        <Section title="Right now">
          <dl className={styles.table}>
            {details(scene, scenePart, state).map(([k, v], i) => (
              <div key={i}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </section>
  )
}

/** every behaviour field the part's role has */
function BehaviourFields({
  doc,
  edit,
  part,
}: {
  doc: Doc
  edit: (d: Doc) => void
  part: PartSpec
}) {
  const b = part.behaviour as unknown as Record<string, unknown>
  const set = (k: string, v: unknown) =>
    edit(patchBehaviour(doc, part.id, { [k]: v }))
  const num = (
    k: string,
    label: string,
    opts: { min?: number; optional?: boolean } = {},
  ) => (
    <NumberField
      key={k}
      label={label}
      value={b[k] as number | undefined}
      min={opts.min}
      optional={opts.optional}
      onCommit={(v) => set(k, v)}
    />
  )
  const flag = (k: string, label: string) => (
    <label key={k} className={styles.switch}>
      <input
        type="checkbox"
        checked={!!b[k]}
        onChange={() => set(k, b[k] ? undefined : true)}
      />
      <span>{label}</span>
    </label>
  )
  const role = part.behaviour.role
  return (
    <>
      <p className={styles.p}>
        A <strong>{role}</strong>.{' '}
        {
          {
            source: 'Makes up to its output.',
            sink: 'Uses up to its demand; higher priority is served first.',
            bus: 'A junction: it pulls from its cheapest input first.',
            gate: 'Passes at most capacity × open.',
            converter: 'Makes its output from what its recipe takes.',
            storage:
              'Fills from what nobody else used, and empties when it is needed.',
            vent: 'Where losses and spills go.',
          }[role]
        }
      </p>
      {(SIGNALS[role] ?? []).map(([k, label]) => (
        <SignalField
          key={`${part.id}.${k}.${String(b[k])}`}
          label={label}
          value={b[k] as string | number | undefined}
          doc={doc}
          onCommit={(v) => set(k, v)}
        />
      ))}
      {role === 'source' && [
        num('merit', 'merit', { optional: true }),
        flag('dispatchable', 'only runs to cover a shortfall'),
      ]}
      {role === 'sink' && [
        num('priority', 'priority', { optional: true }),
        flag('absorbsSurplus', 'only takes what is spare'),
      ]}
      {role === 'gate' && num('capacity', 'capacity', { min: 0 })}
      {role === 'storage' && [
        num('capacity', 'holds', { min: 0 }),
        num('start', 'starts full (0 to 1)', { min: 0, optional: true }),
        num('efficiency', 'efficiency (0 to 1)', { min: 0, optional: true }),
        num('merit', 'merit', { optional: true }),
      ]}
      {role === 'converter' && (
        <>
          <Choice<Domain>
            label="makes"
            value={b.output as Domain}
            options={DOMAINS}
            onChange={(d) => d && set('output', d)}
          />
          {num('capacity', 'capacity', { min: 0, optional: true })}
          {num('startup', 'hours to start', { min: 0, optional: true })}
          <p className={styles.p}>Takes, per unit made:</p>
          {Object.entries(b.recipe as Record<string, number>).map(([d, v]) => (
            <NumberField
              key={d}
              label={d}
              value={v}
              min={0}
              optional
              onCommit={(n) => {
                const recipe = { ...(b.recipe as Record<string, number>) }
                if (n === undefined) delete recipe[d]
                else recipe[d] = n
                set('recipe', recipe)
              }}
            />
          ))}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- a link

export function LinkPanel({
  doc,
  edit,
  select,
  index,
}: EditProps & { index: number }) {
  const l = doc.links[index]
  if (!l) return null
  const from = doc.parts.find((p) => p.id === l.from)
  const to = doc.parts.find((p) => p.id === l.to)
  const drawing = doc.drawing
  const numbered = drawing === 'pid' || drawing === 'pfd'
  const suggest = nextLineNumber(doc)
  return (
    <section className={styles.card} aria-label="Line settings">
      <p className={styles.kicker}>{DOMAIN_NAMES[l.domain]} line</p>
      <h2 className={styles.h}>
        <button
          type="button"
          className={styles.wireName}
          onClick={() => from && select({ kind: 'part', id: from.id })}
        >
          {from?.label ?? l.from}
        </button>{' '}
        →{' '}
        <button
          type="button"
          className={styles.wireName}
          onClick={() => to && select({ kind: 'part', id: to.id })}
        >
          {to?.label ?? l.to}
        </button>
      </h2>
      {drawing && drawing !== 'pictorial' && (
        <Section title="On the drawing">
          <Text
            label={
              numbered ? (drawing === 'pid' ? 'line number' : 'stream') : 'tag'
            }
            value={l.tag}
            placeholder={suggest}
            onCommit={(tag) =>
              edit(patchLink(doc, index, { tag: tag.trim() || undefined }))
            }
          />
          {numbered && !l.tag && suggest && (
            <button
              type="button"
              className={styles.tool}
              onClick={() => edit(patchLink(doc, index, { tag: suggest }))}
            >
              number it {suggest}
            </button>
          )}
          <Choice<LineType>
            label="drawn as"
            value={l.line}
            none={l.domain === 'data' ? 'signal' : 'process'}
            options={LINE_TYPES}
            onChange={(line) => edit(patchLink(doc, index, { line }))}
          />
        </Section>
      )}
      <Section title="Flow">
        <NumberField
          label="carries at most"
          value={l.capacity}
          min={0}
          optional
          onCommit={(capacity) => edit(patchLink(doc, index, { capacity }))}
        />
      </Section>
      <Section title="Route">
        <p className={styles.p}>
          {l.via
            ? `Runs through ${l.via.length} corner${l.via.length === 1 ? '' : 's'}.`
            : 'Runs straight, or round one corner.'}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.tool}
            onClick={() => edit(flipLink(doc, index))}
          >
            turn the corner
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={() => edit(rerouteLink(doc, index))}
          >
            find a path
          </button>
        </div>
      </Section>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.tool}
          onClick={() => {
            edit(removeLink(doc, index))
            select(null)
          }}
        >
          remove
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- an instrument

export function InstrumentPanel({
  doc,
  edit,
  select,
  index,
}: EditProps & { index: number }) {
  const inst = (doc.instruments ?? [])[index]
  if (!inst) return null
  const patch = (p: Partial<InstrumentSpec>) =>
    edit(patchInstrument(doc, index, p))
  const targets = [
    ...doc.parts.map((p) => [p.id, p.tag ?? p.label] as const),
    ...(doc.instruments ?? [])
      .filter((i) => i.tag !== inst.tag)
      .map((i) => [i.tag, i.tag] as const),
  ]
  const gates = doc.parts
    .filter((p) => p.behaviour.role === 'gate')
    .map((p) => [p.id, p.tag ?? p.label] as const)
  return (
    <section className={styles.card} aria-label={`${inst.tag} settings`}>
      <p className={styles.kicker}>Instrument</p>
      <Text
        big
        label="Tag"
        value={inst.tag}
        onCommit={(tag) => tag.trim() && patch({ tag: tag.trim() })}
      />
      <Choice
        label="measures"
        value={inst.measures}
        options={targets}
        onChange={(m) => m && patch({ measures: m })}
      />
      <Choice
        label="drives"
        value={inst.drives}
        none="nothing"
        options={gates}
        onChange={(d) => patch({ drives: d })}
      />
      <Choice
        label="signal"
        value={inst.signal}
        none="electric"
        options={['pneumatic', 'data'] as const}
        onChange={(s) => patch({ signal: s })}
      />
      <Choice
        label="mounted"
        value={inst.mounting}
        none="in the field"
        options={MOUNTINGS.filter((m) => m !== 'field')}
        onChange={(m) => patch({ mounting: m })}
      />
      <NumberField
        label="alarm below"
        value={inst.low}
        optional
        onCommit={(low) => patch({ low })}
      />
      <NumberField
        label="alarm above"
        value={inst.high}
        optional
        onCommit={(high) => patch({ high })}
      />
      <Text
        label="reads"
        value={inst.reads}
        placeholder="part('tank').fill * 100"
        onCommit={(r) => patch({ reads: r.trim() || undefined })}
      />
      <Text
        label="unit"
        value={inst.unit}
        onCommit={(u) => patch({ unit: u.trim() || undefined })}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.tool}
          onClick={() => {
            edit(removeInstrument(doc, index))
            select(null)
          }}
        >
          remove
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- the sheet

const DRAWINGS: Array<readonly [DrawingType, string]> = [
  ['pictorial', 'pictorial'],
  ['pid', 'P&ID'],
  ['single-line', 'single-line'],
  ['pfd', 'PFD'],
]

const TB_FIELDS: Array<[keyof TitleBlock, string]> = [
  ['owner', 'owner'],
  ['project', 'project'],
  ['drawnBy', 'drawn by'],
  ['checkedBy', 'checked by'],
  ['approvedBy', 'approved by'],
  ['issued', 'issued'],
  ['revision', 'revision'],
  ['status', 'status'],
]

export function SheetPanel({
  doc,
  edit,
  onLayout,
}: EditProps & { onLayout: () => void }) {
  const eng = !!doc.drawing && doc.drawing !== 'pictorial'
  const tb = doc.titleBlock ?? {}
  return (
    <section className={styles.card} aria-label="Sheet settings">
      <p className={styles.kicker}>The sheet</p>
      <Text
        big
        label="Title"
        value={doc.title}
        onCommit={(title) => title.trim() && edit(patchSheet(doc, { title }))}
      />
      <Text
        label="subtitle"
        value={doc.subtitle}
        onCommit={(subtitle) =>
          edit(patchSheet(doc, { subtitle: subtitle || undefined }))
        }
      />
      <Choice<DrawingType>
        label="drawn as"
        value={doc.drawing ?? 'pictorial'}
        options={DRAWINGS}
        onChange={(d) =>
          edit(patchSheet(doc, { drawing: d === 'pictorial' ? undefined : d }))
        }
      />
      {doc.drawing === 'single-line' && (
        <Choice
          label="symbols"
          value={doc.symbols}
          none="IEC 60617"
          options={[['ansi', 'ANSI/IEEE 315']] as const}
          onChange={(symbols) => edit(patchSheet(doc, { symbols }))}
        />
      )}
      <div className={styles.pair}>
        <NumberField
          label="columns"
          value={doc.size[0]}
          min={1}
          step={1}
          onCommit={(c) =>
            c &&
            edit(
              patchSheet(doc, {
                size: [Math.min(40, Math.round(c)), doc.size[1]],
              }),
            )
          }
        />
        <NumberField
          label="rows"
          value={doc.size[1]}
          min={1}
          step={1}
          onCommit={(r) =>
            r &&
            edit(
              patchSheet(doc, {
                size: [doc.size[0], Math.min(40, Math.round(r))],
              }),
            )
          }
        />
      </div>
      <Text
        label="id"
        value={doc.id}
        onCommit={(id) =>
          /^[a-z0-9][a-z0-9-]*$/.test(id) && edit(patchSheet(doc, { id }))
        }
      />
      {doc.parts.length > 1 && (
        <button type="button" className={styles.tool} onClick={onLayout}>
          lay it out by its flow
        </button>
      )}
      {eng && (
        <Section title="Title block">
          <Text
            label="drawing no."
            value={doc.sheet}
            placeholder="PID-001"
            onCommit={(sheet) =>
              edit(patchSheet(doc, { sheet: sheet.trim() || undefined }))
            }
          />
          {TB_FIELDS.map(([k, label]) => (
            <Text
              key={k}
              label={label}
              value={tb[k]}
              placeholder={k === 'issued' ? 'YYYY-MM-DD' : undefined}
              onCommit={(v) => {
                const next = { ...tb, [k]: v.trim() || undefined }
                if (!next[k]) delete next[k]
                edit(
                  patchSheet(doc, {
                    titleBlock: Object.keys(next).length ? next : undefined,
                  }),
                )
              }}
            />
          ))}
        </Section>
      )}
    </section>
  )
}
