// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'

import { capture } from '../app/analytics'
import styles from './EvalGallery.module.css'

/*
 * The P&ID evaluation as pictures: every scenario's brief, then what the
 * assistant drew with Anigram and without it, side by side, with their
 * scores, time and tokens. The drawings and numbers are written by
 * eval/pid/gallery.mjs into public/eval/pid/ and fetched when the docs
 * open, so none of it rides in the app.
 */

const ROOT = `${import.meta.env.BASE_URL}eval/pid/`

type Mode = 'mcp' | 'bare'

interface Run {
  image: string | null
  /** `#scene=…`, the Anigram sheet running live */
  link: string | null
  static: number | null
  behaviour: number | null
  missing: string[]
  seconds: number | null
  tokens: number | null
  cost: number | null
}

interface Scenario {
  id: string
  title: string
  kind: string
  prompt: string
  runs: Record<string, Partial<Record<Mode, Run>>>
}

interface Gallery {
  passes: Array<{ id: string }>
  scenarios: Scenario[]
}

const KINDS: Array<[string, string]> = [
  ['', 'All'],
  ['dataset', 'Draw a DEXPI file'],
  ['dataset (described)', 'Draw a described plant'],
  ['dataset (modified)', 'Change a DEXPI file'],
  ['written', 'Written briefs'],
]

const SIDE: Record<Mode, string> = {
  mcp: 'With Anigram',
  bare: 'Without, its own SVG',
}

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(100 * v)}%`)
const kTokens = (n: number | null) =>
  n === null
    ? null
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M tokens`
      : `${Math.round(n / 1000)}k tokens`

export function EvalGallery() {
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState('')
  const [pass, setPass] = useState('')
  const [open, setOpen] = useState<Scenario | null>(null)

  useEffect(() => {
    let live = true
    fetch(`${ROOT}gallery.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Gallery>) : Promise.reject()))
      .then((g) => live && setGallery(g))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  if (failed)
    return (
      <p className={styles.note}>The drawings couldn’t be loaded just now.</p>
    )
  if (!gallery) return <p className={styles.note}>Loading the drawings…</p>

  // the latest pass first: only it has token counts
  const at = pass || gallery.passes.at(-1)!.id
  const shown = gallery.scenarios.filter((s) => !kind || s.kind === kind)

  return (
    <div className={styles.gallery}>
      <div className={styles.bar}>
        <div className={styles.seg} role="group" aria-label="Kind of scenario">
          {KINDS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={kind === id}
              className={kind === id ? styles.on : styles.off}
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {gallery.passes.length > 1 && (
          <div className={styles.seg} role="group" aria-label="Pass">
            {gallery.passes.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={at === p.id}
                className={at === p.id ? styles.on : styles.off}
                onClick={() => setPass(p.id)}
              >
                Pass {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.map((s) => (
        <Card
          key={s.id}
          scenario={s}
          pass={at}
          onCompare={() => {
            setOpen(s)
            capture('docs_eval_compared', { scenario: s.id })
          }}
        />
      ))}

      {open && (
        <Compare scenario={open} pass={at} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

function Card({
  scenario: s,
  pass,
  onCompare,
}: {
  scenario: Scenario
  pass: string
  onCompare: () => void
}) {
  const [whole, setWhole] = useState(false)
  const runs = s.runs[pass] ?? {}
  return (
    <article className={styles.card} aria-labelledby={`eval-${s.id}`}>
      <header className={styles.head}>
        <h4 id={`eval-${s.id}`} className={styles.name}>
          {s.title}
        </h4>
        <span className={styles.kind}>
          {KINDS.find(([id]) => id === s.kind)?.[1] ?? s.kind}
        </span>
      </header>
      <p className={whole ? styles.brief : styles.briefShort}>{s.prompt}</p>
      <button
        type="button"
        className={styles.more}
        aria-expanded={whole}
        onClick={() => setWhole(!whole)}
      >
        {whole ? 'Less of the brief' : 'The whole brief'}
      </button>
      <div className={styles.pair}>
        {(['mcp', 'bare'] as const).map((m) => (
          <Side
            key={m}
            mode={m}
            run={runs[m]}
            title={s.title}
            onCompare={onCompare}
          />
        ))}
      </div>
    </article>
  )
}

function Side({
  mode,
  run,
  title,
  onCompare,
}: {
  mode: Mode
  run: Run | undefined
  title: string
  onCompare: () => void
}) {
  const facts = [
    run?.seconds != null ? `${run.seconds} s` : null,
    kTokens(run?.tokens ?? null),
    run?.cost != null ? `$${run.cost.toFixed(2)}` : null,
  ].filter(Boolean)
  return (
    <figure className={styles.side}>
      <figcaption className={styles.label}>{SIDE[mode]}</figcaption>
      {run?.image ? (
        <button
          type="button"
          className={styles.frame}
          onClick={onCompare}
          aria-label={`${title}: compare the two drawings full size`}
        >
          <img
            src={`${ROOT}${run.image}`}
            alt={`${title}, drawn ${mode === 'mcp' ? 'with Anigram' : 'without it'}`}
            loading="lazy"
            decoding="async"
          />
        </button>
      ) : (
        <div className={styles.empty}>No drawing delivered</div>
      )}
      <dl className={styles.scores}>
        <div>
          <dt>drawing</dt>
          <dd>{pct(run?.static ?? null)}</dd>
        </div>
        <div>
          <dt>behaviour</dt>
          <dd>
            {mode === 'bare'
              ? 'can’t run'
              : run?.behaviour == null
                ? 'none claimed'
                : pct(run.behaviour)}
          </dd>
        </div>
      </dl>
      <p className={styles.facts}>{facts.join(' · ')}</p>
      {run && run.missing.length > 0 && (
        <details className={styles.missing}>
          <summary>
            Missed {run.missing.length}{' '}
            {run.missing.length === 1 ? 'thing' : 'things'}
          </summary>
          <ul>
            {run.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </details>
      )}
      {run?.link && (
        <a
          className={styles.live}
          href={`./${run.link}`}
          target="_blank"
          rel="noreferrer"
        >
          Run it live ↗
        </a>
      )}
    </figure>
  )
}

/**
 * both drawings as large as the window allows: side by side, or one above
 * the other when both sheets are wide. Escape, ✕ or the backdrop closes.
 */
function Compare({
  scenario: s,
  pass,
  onClose,
}: {
  scenario: Scenario
  pass: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [wide, setWide] = useState<Partial<Record<Mode, boolean>>>({})
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  const runs = s.runs[pass] ?? {}
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="eval-compare"
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop, outside the panel
        if (e.target === e.currentTarget) ref.current?.close()
      }}
    >
      <div className={styles.dialogHead}>
        <h4 id="eval-compare" className={styles.name}>
          {s.title}
        </h4>
        <button
          type="button"
          className={styles.close}
          autoFocus
          onClick={() => ref.current?.close()}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className={wide.mcp && wide.bare ? styles.bigStacked : styles.big}>
        {(['mcp', 'bare'] as const).map((m) => (
          <figure key={m} className={styles.bigSide}>
            <figcaption className={styles.label}>
              {SIDE[m]} · drawing {pct(runs[m]?.static ?? null)}
            </figcaption>
            {runs[m]?.image ? (
              <img
                src={`${ROOT}${runs[m]!.image}`}
                alt={`${s.title}, drawn ${m === 'mcp' ? 'with Anigram' : 'without it'}`}
                onLoad={(e) => {
                  const img = e.currentTarget
                  const w = img.naturalWidth > 1.5 * img.naturalHeight
                  setWide((was) => ({ ...was, [m]: w }))
                }}
              />
            ) : (
              <div className={styles.empty}>No drawing delivered</div>
            )}
          </figure>
        ))}
      </div>
    </dialog>
  )
}
