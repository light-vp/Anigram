// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useMemo, useState } from 'react'

import { capture } from '../app/analytics'
import type { DayReport } from '../format/report.ts'
import { checkRequirements, requirementUnit } from '../format/requires.ts'
import { sizing } from '../format/sizing.ts'
import type { Sizing } from '../format/sizing.ts'
import { EFFORT_UNITS } from '../sim/types.ts'
import type { PartSpec, Requirement, Scene } from '../sim/types.ts'
import { addRequirement, applySizing, removeRequirement } from './doc.ts'
import type { Doc } from './doc.ts'
import type { Selection } from './selection.ts'
import styles from './Editor.module.css'

/*
 * Does it work? Each requirement is a rule on one part, picked from plain
 * sentences ("never runs dry", "always gets what it asks for", "pressure
 * stays under"), and answered yes or no from the simulated day with how
 * close it came. When one fails, "Size it" searches for the smallest change
 * that makes them all hold, says what a resized machine then takes in, and
 * applies it to the file in one click.
 */

/** a sentence a requirement can be built from */
interface Rule {
  key: string
  says: string
  reads: Requirement['reads']
  bound: 'min' | 'max'
  /** a rule with nothing to fill in */
  fixed?: number
  per?: 'day'
}

function rulesFor(scene: Scene, part: PartSpec): Rule[] {
  const role = part.behaviour.role
  const rules: Rule[] = []
  if (role === 'sink')
    rules.push(
      {
        key: 'served',
        says: 'always gets what it asks for',
        reads: 'served',
        bound: 'min',
        fixed: 1,
      },
      {
        key: 'served-pct',
        says: 'gets at least this share of what it asks for',
        reads: 'served',
        bound: 'min',
      },
      { key: 'in-min', says: 'gets at least', reads: 'in', bound: 'min' },
      {
        key: 'in-day',
        says: 'gets at least this much a day',
        reads: 'in',
        bound: 'min',
        per: 'day',
      },
      { key: 'in-max', says: 'takes no more than', reads: 'in', bound: 'max' },
    )
  else if (role === 'storage')
    rules.push(
      {
        key: 'dry',
        says: 'never runs dry',
        reads: 'fill',
        bound: 'min',
        fixed: 0.02,
      },
      {
        key: 'fill-min',
        says: 'stays above this full',
        reads: 'fill',
        bound: 'min',
      },
      {
        key: 'fill-max',
        says: 'stays below this full',
        reads: 'fill',
        bound: 'max',
      },
    )
  else
    rules.push(
      { key: 'out-min', says: 'delivers at least', reads: 'out', bound: 'min' },
      {
        key: 'out-day',
        says: 'delivers at least this much a day',
        reads: 'out',
        bound: 'min',
        per: 'day',
      },
      {
        key: 'out-max',
        says: 'delivers no more than',
        reads: 'out',
        bound: 'max',
      },
    )
  const domain = scene.links.find(
    (l) => (l.from === part.id || l.to === part.id) && !l.loss,
  )?.domain
  const q = domain && EFFORT_QUANTITY[domain]
  if (q && (scene.units[domain]?.effort ?? EFFORT_UNITS[domain]))
    rules.push(
      {
        key: 'effort-max',
        says: `${q} stays under`,
        reads: 'effort',
        bound: 'max',
      },
      {
        key: 'effort-min',
        says: `${q} stays above`,
        reads: 'effort',
        bound: 'min',
      },
    )
  return rules
}

const EFFORT_QUANTITY: Record<string, string> = {
  water: 'pressure',
  fuel: 'pressure',
  oil: 'pressure',
  air: 'pressure',
  electric: 'voltage',
  heat: 'temperature',
}

export function Requirements({
  doc,
  scene,
  day,
  onEdit,
  onSelect,
}: {
  doc: Doc
  /** the scene as the file stands, when it runs */
  scene: Scene | undefined
  /** its simulated day */
  day: DayReport | undefined
  onEdit: (next: Doc) => void
  onSelect: (s: Selection) => void
}) {
  const results = useMemo(
    () => (scene && day && scene.requires ? checkRequirements(scene, day) : []),
    [scene, day],
  )
  const [adding, setAdding] = useState(false)
  const [sized, setSized] = useState<{
    for: Scene
    sizing?: Sizing
    runs: number
  }>()
  const failing = results.filter((r) => !r.ok).length

  // a search belongs to the scene it was run on; an edit drops it
  const current = sized && sized.for === scene ? sized : undefined
  const searching = current && !current.sizing ? current.for : undefined
  useEffect(() => {
    if (!searching) return
    const scene = searching
    const it = sizing(scene)
    let stop = false
    const step = () => {
      if (stop) return
      const t = performance.now()
      // a day at a time, a frame's worth at once, so the page keeps moving
      for (;;) {
        const n = it.next()
        if (n.done) {
          setSized({ for: scene, sizing: n.value, runs: n.value.runs })
          return
        }
        if (performance.now() - t > 40) {
          setSized({ for: scene, runs: n.value.runs })
          break
        }
      }
      setTimeout(step, 0)
    }
    setTimeout(step, 0)
    return () => {
      stop = true
    }
  }, [searching])

  if (!scene) return null
  return (
    <section className={styles.card} aria-label="Requirements">
      <div className={styles.row}>
        <h2 className={styles.h}>Requirements</h2>
        {results.length > 0 && (
          <span className={styles.muted}>
            {failing ? `${failing} of ${results.length} not met` : 'all met'}
          </span>
        )}
      </div>
      {!results.length && !adding && (
        <p className={styles.p}>
          What must it do? Add a rule and the day is checked against it.
        </p>
      )}
      {results.length > 0 && (
        <ul className={styles.reqs}>
          {results.map((r, i) => (
            <li key={i} data-ok={r.ok}>
              <span className={styles.reqMark} aria-hidden="true">
                {r.ok ? '✓' : '✗'}
              </span>
              <button
                type="button"
                className={styles.reqSays}
                onClick={() => onSelect({ kind: 'part', id: r.part })}
              >
                {r.says}
                <span className={styles.reqAnswer}>{r.answer}</span>
              </button>
              <button
                type="button"
                className={styles.reqRemove}
                aria-label={`Remove: ${r.says}`}
                onClick={() => onEdit(removeRequirement(doc, i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <AddRequirement
          scene={scene}
          onAdd={(r) => {
            onEdit(addRequirement(doc, r))
            setAdding(false)
            capture('editor_requirement_added', { reads: r.reads })
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.tool}
            onClick={() => setAdding(true)}
          >
            + Add a requirement
          </button>
          {failing > 0 && !current && (
            <button
              type="button"
              className={styles.tool}
              onClick={() => {
                setSized({ for: scene, runs: 0 })
                capture('editor_sized')
              }}
            >
              Size it
            </button>
          )}
        </div>
      )}
      {current && (
        <SizingResult
          state={current}
          onApply={(changes) => {
            onEdit(applySizing(doc, changes))
            capture('editor_sizing_applied')
          }}
        />
      )}
    </section>
  )
}

function SizingResult({
  state,
  onApply,
}: {
  state: { sizing?: Sizing; runs: number }
  onApply: (changes: Parameters<typeof applySizing>[1]) => void
}) {
  const s = state.sizing
  if (!s)
    return (
      <p className={styles.muted} role="status">
        Sizing… {state.runs} days simulated
      </p>
    )
  const options = s.options.length
    ? s.options
    : s.alone.flatMap((a) => a.options)
  return (
    <div className={styles.sizing} role="status">
      <p className={styles.subhead}>
        {s.options.length
          ? 'To meet every requirement'
          : options.length
            ? 'No one change meets them all. On its own'
            : 'No size fits'}
      </p>
      {!options.length && (
        <p className={styles.p}>
          Nothing upstream meets it within ten times its size. The limit may be
          a control, the demand itself, or a rule that can never hold.
        </p>
      )}
      {options.map((o, i) => (
        <div key={i} className={styles.option}>
          <ul>
            {o.changes.map((c, j) => (
              <li key={j}>{c.text}</li>
            ))}
            {o.needs.map((n, j) => (
              <li key={`n${j}`} className={styles.needs}>
                {n}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={styles.tool}
            onClick={() => onApply(o.changes)}
          >
            Apply
          </button>
        </div>
      ))}
      {s.partial && (
        <p className={styles.muted}>Stopped after {s.runs} simulated days.</p>
      )}
    </div>
  )
}

function AddRequirement({
  scene,
  onAdd,
  onCancel,
}: {
  scene: Scene
  onAdd: (r: Requirement) => void
  onCancel: () => void
}) {
  const parts = scene.parts.filter(
    (p) => p.behaviour.role !== 'vent' && p.behaviour.role !== 'bus',
  )
  const first =
    parts.find((p) => p.behaviour.role === 'sink') ??
    parts[0] ??
    scene.parts[0]!
  const [partId, setPartId] = useState(first.id)
  const part = scene.parts.find((p) => p.id === partId) ?? first
  const rules = rulesFor(scene, part)
  const [ruleKey, setRuleKey] = useState(rules[0]!.key)
  const rule = rules.find((r) => r.key === ruleKey) ?? rules[0]!
  const [value, setValue] = useState('')
  const [hoursOnly, setHoursOnly] = useState(false)
  const [from, setFrom] = useState('8')
  const [to, setTo] = useState('18')

  const draft: Requirement = { part: part.id, reads: rule.reads }
  if (rule.per) draft.per = rule.per
  const unit = requirementUnit(scene, draft)
  const pct = unit === '%'
  const n = Number(value)
  const filled =
    rule.fixed !== undefined || (value.trim() !== '' && Number.isFinite(n))
  const limit = rule.fixed ?? (pct ? n / 100 : n)
  const hour = (s: string) =>
    Math.max(0, Math.min(24, Math.round(Number(s) || 0)))

  return (
    <form
      className={styles.pair}
      onSubmit={(e) => {
        e.preventDefault()
        if (!filled) return
        const r: Requirement = { ...draft, [rule.bound]: limit }
        if (hoursOnly && !rule.per) {
          r.from = hour(from)
          r.to = hour(to)
        }
        onAdd(r)
      }}
    >
      <label className={styles.stack}>
        Part
        <select
          className={styles.select}
          value={part.id}
          onChange={(e) => {
            setPartId(e.target.value)
            setRuleKey('')
          }}
        >
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.stack}>
        Must
        <select
          className={styles.select}
          value={rule.key}
          onChange={(e) => setRuleKey(e.target.value)}
        >
          {rules.map((r) => (
            <option key={r.key} value={r.key}>
              {r.says}
            </option>
          ))}
        </select>
      </label>
      {rule.fixed === undefined && (
        <label className={styles.fieldRow}>
          {rule.bound === 'min' ? 'At least' : 'At most'}
          <span className={styles.field}>
            <input
              className={styles.input}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Limit"
              autoFocus
            />
            <span className={styles.muted}>{unit}</span>
          </span>
        </label>
      )}
      {!rule.per && (
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={hoursOnly}
            onChange={(e) => setHoursOnly(e.target.checked)}
          />
          only between certain hours
        </label>
      )}
      {hoursOnly && !rule.per && (
        <div className={styles.fieldRow}>
          Hours
          <span className={styles.field}>
            <input
              className={styles.input}
              inputMode="numeric"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From hour"
            />
            to
            <input
              className={styles.input}
              inputMode="numeric"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To hour"
            />
          </span>
        </div>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.tool} disabled={!filled}>
          Add
        </button>
        <button type="button" className={styles.tool} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
