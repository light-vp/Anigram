// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'

import { glyphFor } from '../parts/index.ts'
import type { Frame } from '../sim/runtime.ts'
import type { PartState } from '../sim/solver.ts'
import { capture } from '../app/analytics'
import { useFrame, usePrefersReducedMotion, useSimulation } from '../app/hooks'
import { Alerts } from '../app/panels'
import { Transport } from '../app/Transport'
import { REPO_URL } from '../app/SourceLink'
import { CELL, HEAD_H, PAD, sheetSize } from '../view/geometry.ts'
import { details } from '../view/format.ts'
import { DOMAIN_NAMES, THEMES, paletteVars } from '../view/palette.ts'
import type { ThemeId } from '../view/palette.ts'
import { Sheet } from '../view/Sheet.tsx'
import { PRESETS, PRESETS_BY_GROUP, PROFILES } from './presets.ts'
import type { ProfileId } from './presets.ts'
import {
  connect,
  decode,
  encode,
  labelOf,
  nextId,
  partAt,
  removeLink,
  removePart,
  sanitize,
  sizeOf,
  toScene,
} from './spec.ts'
import type { BuildLink, BuildPart, BuildSpec } from './spec.ts'
import { STARTERS } from './starters.ts'
import styles from './Builder.module.css'

/*
 * The playground: build a sheet from parts and watch it run. Pick a part and
 * drop it on a square; drag one part onto another to connect them, or onto
 * an empty square to move it. Every edit rebuilds the scene and restarts the
 * simulation at the same time of day, so the drawing never shows anything
 * the solver didn't decide.
 */

const STORE = 'anigram.build.v1'

type Cell = [number, number]

function initialSpec(): BuildSpec {
  const hash = new URLSearchParams(window.location.hash.slice(1)).get('sheet')
  if (hash) {
    const shared = decode(hash)
    if (shared) return shared
  }
  try {
    const saved = window.localStorage.getItem(STORE)
    const spec = saved ? sanitize(JSON.parse(saved)) : null
    if (spec) return spec
  } catch {
    // storage blocked or garbled: start fresh
  }
  return structuredClone(STARTERS[0]!.spec)
}

export interface BuilderProps {
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
  /** false inside the portfolio's iframe, which has its own header */
  header: boolean
}

export function Builder({ theme, onTheme, header }: BuilderProps) {
  const [history, setHistory] = useState(() => ({
    past: [] as BuildSpec[],
    now: initialSpec(),
    future: [] as BuildSpec[],
  }))
  const spec = history.now
  const [armed, setArmed] = useState<string | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  // the clock survives a rebuild, so an edit doesn't throw you back to dawn
  const clock = useRef({ hour: 6, day: 0, speed: 1, playing: true })

  const scene = useMemo(() => toScene(spec), [spec])

  const commit = useCallback((next: BuildSpec) => {
    setHistory((h) => ({
      past: [...h.past, h.now].slice(-80),
      now: next,
      future: [],
    }))
    setVersion((v) => v + 1)
  }, [])

  const undo = useCallback(() => {
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            now: h.past[h.past.length - 1]!,
            future: [h.now, ...h.future],
          }
        : h,
    )
    setVersion((v) => v + 1)
  }, [])

  const redo = useCallback(() => {
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.now],
            now: h.future[0]!,
            future: h.future.slice(1),
          }
        : h,
    )
    setVersion((v) => v + 1)
  }, [])

  // remember the sheet between visits
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE, JSON.stringify(spec))
    } catch {
      // private window: the sheet just won't persist
    }
  }, [spec])

  // a selection can outlive its part through undo
  useEffect(() => {
    if (selected && !spec.parts.some((p) => p.id === selected))
      setSelected(null)
  }, [spec, selected])

  // keys: escape lets go, delete removes, ⌘Z / ⌘⇧Z step through history
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, dialog')) return
      if (e.key === 'Escape') {
        setArmed(null)
        setLinkFrom(null)
        setSelected(null)
        setNote(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        commit(removePart(spec, selected))
        setSelected(null)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spec, selected, commit, undo, redo])

  const place = (kind: string, at: Cell) => {
    const id = nextId(spec, kind)
    commit({ ...spec, parts: [...spec.parts, { id, kind, at }] })
    setSelected(id)
    setArmed(null)
    setNote('Now drag it onto a part to connect them.')
    capture('build_part_placed', { kind })
  }

  const link = (from: string, to: string) => {
    const result = connect(spec, from, to)
    if ('error' in result) {
      setNote(result.error)
      return
    }
    commit(result.spec)
    setNote(null)
    capture('build_linked')
  }

  const move = (id: string, at: Cell) => {
    commit({
      ...spec,
      parts: spec.parts.map((p) => (p.id === id ? { ...p, at } : p)),
    })
  }

  const updatePart = (id: string, patch: Partial<BuildPart>) => {
    commit({
      ...spec,
      parts: spec.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  const onCell = (cell: Cell, dragFrom: string | null) => {
    const here = partAt(spec, cell)
    if (dragFrom) {
      if (!here) move(dragFrom, cell)
      else if (here.id !== dragFrom) link(dragFrom, here.id)
      return
    }
    if (armed) {
      if (here) setNote('That square is taken — pick an empty one.')
      else place(armed, cell)
      return
    }
    if (linkFrom) {
      if (here && here.id !== linkFrom) link(linkFrom, here.id)
      setLinkFrom(null)
      return
    }
    setSelected(here ? here.id : null)
    setNote(null)
  }

  const start = (id: string) => {
    const starter = STARTERS.find((s) => s.id === id)
    if (!starter) return
    commit(structuredClone(starter.spec))
    setSelected(null)
    setNote(null)
    capture('build_starter', { starter: id })
  }

  const shareUrl = () => {
    const base = `${window.location.origin}${window.location.pathname}`
    return `${base}?build=1#sheet=${encode(spec)}`
  }

  const selectedPart = selected
    ? spec.parts.find((p) => p.id === selected)
    : undefined

  return (
    <div className={header ? styles.app : `${styles.app} ${styles.noHeader}`}>
      {header && (
        <header className={styles.header}>
          <strong>Anigram</strong>
          <span className={styles.muted}>
            playground — build a living diagram
          </span>
          <span className={styles.spacer} />
          <a href="./" className={styles.link}>
            the five sheets
          </a>
          <a
            href={REPO_URL}
            className={styles.link}
            target="_blank"
            rel="noreferrer"
          >
            source ↗
          </a>
        </header>
      )}

      <div className={styles.tools} role="toolbar" aria-label="Playground">
        <label className={styles.field}>
          <input
            className={styles.title}
            value={spec.title}
            maxLength={80}
            aria-label="Sheet title"
            onChange={(e) =>
              setHistory((h) => ({
                ...h,
                now: { ...h.now, title: e.target.value },
              }))
            }
          />
        </label>
        <label className={styles.field}>
          <span className={styles.muted}>start from</span>
          <select
            className={styles.select}
            value=""
            onChange={(e) => start(e.target.value)}
          >
            <option value="" disabled>
              choose…
            </option>
            {STARTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.tool}
          onClick={undo}
          disabled={!history.past.length}
          title="Undo (⌘Z)"
        >
          undo
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={redo}
          disabled={!history.future.length}
          title="Redo (⌘⇧Z)"
        >
          redo
        </button>
        <div className={styles.seg} role="group" aria-label="Sheet colour">
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => onTheme('light')}
          >
            light
          </button>
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={() => onTheme('dark')}
          >
            dark
          </button>
        </div>
        <CopyButton
          label="copy link"
          text={shareUrl}
          event="build_link_copied"
        />
        <CopyButton
          label="copy json"
          text={() => JSON.stringify(spec, null, 2)}
          event="build_json_copied"
          title="The sheet as a file — the same shape a coding assistant writes"
        />
      </div>

      <div className={styles.main}>
        <Palette
          theme={theme}
          armed={armed}
          onArm={(k) => {
            setArmed((a) => (a === k ? null : k))
            setLinkFrom(null)
            setNote(null)
          }}
        />

        <Running
          key={version}
          spec={spec}
          scene={scene}
          theme={theme}
          clock={clock}
          selected={selected}
          armed={armed}
          linkFrom={linkFrom}
          onCell={onCell}
          note={note}
        >
          {(frame) => (
            <aside className={styles.side}>
              {selectedPart ? (
                <PartPanel
                  key={selectedPart.id}
                  spec={spec}
                  part={selectedPart}
                  frame={frame}
                  scene={scene}
                  linking={linkFrom === selectedPart.id}
                  onChange={(patch) => updatePart(selectedPart.id, patch)}
                  onConnect={() => {
                    setLinkFrom(
                      linkFrom === selectedPart.id ? null : selectedPart.id,
                    )
                    setArmed(null)
                    setNote('Click the part it should feed.')
                  }}
                  onRemoveLink={(l) => commit(removeLink(spec, l))}
                  onFlip={(l, bend) =>
                    commit({
                      ...spec,
                      links: spec.links.map((x) =>
                        x.from === l.from && x.to === l.to ? { ...x, bend } : x,
                      ),
                    })
                  }
                  onDelete={() => {
                    commit(removePart(spec, selectedPart.id))
                    setSelected(null)
                  }}
                />
              ) : (
                <section className={styles.card}>
                  <h2 className={styles.h}>Build a living diagram</h2>
                  <ol className={styles.steps}>
                    <li>
                      Pick a part on the left, then click an empty square.
                    </li>
                    <li>
                      Drag one part onto another to connect them. Drag to an
                      empty square to move it.
                    </li>
                    <li>
                      Click a part to size it, give it a day, or flip its
                      switch.
                    </li>
                  </ol>
                  <p className={styles.p}>
                    Nothing here is animated by hand. Line thickness is how much
                    flows, the dots move at its speed, and a part goes red when
                    it can’t get what it needs.
                  </p>
                </section>
              )}
              <Alerts frame={frame} onSelect={(id) => setSelected(id)} />
            </aside>
          )}
        </Running>
      </div>
    </div>
  )
}

/** the sheet, its overlay and the clock — remounted on every edit */
function Running({
  spec,
  scene,
  theme,
  clock,
  selected,
  armed,
  linkFrom,
  onCell,
  note,
  children,
}: {
  spec: BuildSpec
  scene: ReturnType<typeof toScene>
  theme: ThemeId
  clock: {
    current: { hour: number; day: number; speed: number; playing: boolean }
  }
  selected: string | null
  armed: string | null
  linkFrom: string | null
  onCell: (cell: Cell, dragFrom: string | null) => void
  note: string | null
  children: (frame: Frame) => ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  const sim = useSimulation(scene, (s) => {
    s.seek(clock.current.hour)
    s.day = clock.current.day
    s.setSpeed(clock.current.speed)
    s.setPlaying(clock.current.playing && !reduced)
  })
  const frame = useFrame(sim)

  useEffect(() => {
    sim.animate = !reduced
  }, [sim, reduced])

  useEffect(() => {
    clock.current = {
      hour: frame.hour,
      day: frame.day,
      speed: sim.speed,
      playing: sim.playing,
    }
  }, [frame, sim, clock])

  // space plays and pauses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, button, select, dialog')) return
      if (e.key === ' ') {
        e.preventDefault()
        sim.setPlaying(!sim.playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  const { w, h } = sheetSize(scene)

  return (
    <>
      <div className={styles.stage}>
        <div
          className={styles.sheetWrap}
          // as wide as the column allows, but short enough to keep the clock in view
          style={{
            aspectRatio: `${w} / ${h}`,
            maxWidth: `calc((100vh - 190px) * ${(w / h).toFixed(4)})`,
          }}
        >
          <Sheet
            scene={scene}
            frame={frame}
            theme={theme}
            annotate={reduced}
            animate={!reduced}
            selected={selected}
            className={styles.sheet}
          />
          <Overlay
            spec={spec}
            w={w}
            h={h}
            armed={armed}
            linkFrom={linkFrom}
            selected={selected}
            onCell={onCell}
          />
        </div>
        <p className={styles.note} aria-live="polite">
          {note ??
            (spec.parts.length === 0
              ? 'An empty sheet. Pick a part on the left to begin.'
              : ' ')}
        </p>
        <Transport sim={sim} frame={frame} />
      </div>
      {children(frame)}
    </>
  )
}

/** the grid you build on, drawn over the sheet */
function Overlay({
  spec,
  w,
  h,
  armed,
  linkFrom,
  selected,
  onCell,
}: {
  spec: BuildSpec
  w: number
  h: number
  armed: string | null
  linkFrom: string | null
  selected: string | null
  onCell: (cell: Cell, dragFrom: string | null) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [drag, setDrag] = useState<{
    id: string
    from: Cell
    moved: boolean
    x: number
    y: number
  } | null>(null)

  const toSheet = (e: ReactPointerEvent) => {
    const svg = ref.current
    if (!svg) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    )
    const c = Math.floor((pt.x - PAD) / CELL)
    const r = Math.floor((pt.y - HEAD_H) / CELL)
    const inside = c >= 0 && r >= 0 && c < spec.size[0] && r < spec.size[1]
    return { x: pt.x, y: pt.y, cell: inside ? ([c, r] as Cell) : null }
  }

  const centre = ([c, r]: Cell) =>
    [PAD + c * CELL + CELL / 2, HEAD_H + r * CELL + CELL / 2] as const
  const target = hover ? partAt(spec, hover) : undefined
  const busy = !!(armed || linkFrom || drag)

  return (
    <svg
      ref={ref}
      className={busy ? `${styles.overlay} ${styles.busy}` : styles.overlay}
      viewBox={`0 0 ${w} ${h}`}
      onPointerDown={(e) => {
        const at = toSheet(e)
        if (!at?.cell) return
        const here = partAt(spec, at.cell)
        if (here && !armed && !linkFrom) {
          ref.current?.setPointerCapture(e.pointerId)
          setDrag({
            id: here.id,
            from: at.cell,
            moved: false,
            x: at.x,
            y: at.y,
          })
        }
      }}
      onPointerMove={(e) => {
        const at = toSheet(e)
        setHover(at?.cell ?? null)
        if (drag && at) {
          const moved =
            drag.moved ||
            !at.cell ||
            at.cell[0] !== drag.from[0] ||
            at.cell[1] !== drag.from[1]
          setDrag({ ...drag, moved, x: at.x, y: at.y })
        }
      }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={(e) => {
        const at = toSheet(e)
        const d = drag
        setDrag(null)
        if (!at?.cell) return
        if (d && d.moved) onCell(at.cell, d.id)
        else onCell(at.cell, null)
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {/* the grid, faint, so you can see where things can go */}
      {Array.from({ length: spec.size[0] * spec.size[1] }, (_, i) => {
        const c = i % spec.size[0]
        const r = Math.floor(i / spec.size[0])
        if (partAt(spec, [c, r])) return null
        const [x, y] = centre([c, r])
        return <circle key={i} className={styles.dot} cx={x} cy={y} r={1.6} />
      })}

      {hover && (armed || (drag?.moved && !target)) && !target && (
        <PlaceGhost
          kind={armed ?? spec.parts.find((p) => p.id === drag?.id)?.kind ?? ''}
          at={centre(hover)}
        />
      )}

      {hover &&
        target &&
        (drag?.moved || linkFrom) &&
        target.id !== (drag?.id ?? linkFrom) && (
          <rect
            className={styles.targetRing}
            x={centre(hover)[0] - 32}
            y={centre(hover)[1] - 32}
            width={64}
            height={64}
            rx={16}
          />
        )}

      {hover && target && !busy && target.id !== selected && (
        <rect
          className={styles.hoverRing}
          x={centre(hover)[0] - 30}
          y={centre(hover)[1] - 30}
          width={60}
          height={60}
          rx={15}
        />
      )}

      {drag?.moved && (
        <line
          className={styles.wire}
          x1={centre(drag.from)[0]}
          y1={centre(drag.from)[1]}
          x2={drag.x}
          y2={drag.y}
        />
      )}

      {linkFrom &&
        (() => {
          const from = spec.parts.find((p) => p.id === linkFrom)
          if (!from) return null
          const [x, y] = centre(from.at)
          return <circle className={styles.linkFrom} cx={x} cy={y} r={36} />
        })()}
    </svg>
  )
}

function PlaceGhost({
  kind,
  at: [x, y],
}: {
  kind: string
  at: readonly [number, number]
}) {
  return (
    <g className={styles.ghost} transform={`translate(${x} ${y})`}>
      <rect x={-26} y={-26} width={52} height={52} rx={14} />
      {kind && <GlyphIcon kind={kind} />}
    </g>
  )
}

/** how a part looks in the bin: switched on and mid-way through its work */
const SHOWN: PartState = {
  in: 1,
  out: 1,
  demand: 1,
  avail: 1,
  level: 0.6,
  fill: 0.6,
  loss: 0,
  open: 1,
  starting: false,
  activity: 0.6,
}

function GlyphIcon({ kind }: { kind: string }) {
  const Glyph = glyphFor(kind)
  return <Glyph s={SHOWN} phase={0} />
}

/** the parts bin */
function Palette({
  theme,
  armed,
  onArm,
}: {
  theme: ThemeId
  armed: string | null
  onArm: (kind: string) => void
}) {
  const vars = paletteVars(THEMES[theme]) as CSSProperties
  return (
    <nav className={styles.palette} aria-label="Parts">
      {PRESETS_BY_GROUP.map((g) => (
        <div key={g.id} className={styles.group}>
          <h2 className={styles.groupName}>{g.label}</h2>
          <div className={styles.bin}>
            {g.presets.map((p) => (
              <button
                key={p.kind}
                type="button"
                className={styles.piece}
                aria-pressed={armed === p.kind}
                onClick={() => onArm(p.kind)}
                title={p.note}
              >
                <svg viewBox="-22 -22 44 44" style={vars} aria-hidden="true">
                  <GlyphIcon kind={p.kind} />
                </svg>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** the selected part: its settings, its wiring, and what it's doing now */
function PartPanel({
  spec,
  part,
  frame,
  scene,
  linking,
  onChange,
  onConnect,
  onRemoveLink,
  onFlip,
  onDelete,
}: {
  spec: BuildSpec
  part: BuildPart
  frame: Frame
  scene: ReturnType<typeof toScene>
  linking: boolean
  onChange: (patch: Partial<BuildPart>) => void
  onConnect: () => void
  onRemoveLink: (link: BuildLink) => void
  onFlip: (link: BuildLink, bend: 'hv' | 'vh') => void
  onDelete: () => void
}) {
  const preset = PRESETS.get(part.kind)!
  const [label, setLabel] = useState(labelOf(part))
  const [size, setSize] = useState(sizeOf(part))
  const state = frame.parts[part.id]
  const scenePart = scene.parts.find((p) => p.id === part.id)
  const on = part.on ?? preset.switch?.start ?? false
  // one row per neighbour: a charge/discharge pair reads as one wire
  const wires = spec.links.filter(
    (l) =>
      (l.from === part.id || l.to === part.id) &&
      !(
        l.to === part.id &&
        spec.links.some((x) => x.from === part.id && x.to === l.from)
      ),
  )

  return (
    <section className={styles.card} aria-label={`${labelOf(part)} settings`}>
      {labelOf(part) !== preset.name && (
        <p className={styles.kicker}>{preset.name}</p>
      )}
      <input
        className={styles.nameInput}
        value={label}
        maxLength={40}
        aria-label="Label"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label !== labelOf(part) && onChange({ label })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <p className={styles.p}>{preset.note}</p>

      {preset.size && (
        <label className={styles.knob}>
          <span className={styles.knobHead}>
            <span>{preset.size.label}</span>
            <output>
              {size} {preset.size.unit}
            </output>
          </span>
          <input
            type="range"
            min={0}
            max={preset.size.max}
            step={preset.size.max > 100 ? 5 : preset.size.max > 20 ? 1 : 0.1}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            onPointerUp={() => size !== sizeOf(part) && onChange({ size })}
            onKeyUp={() => size !== sizeOf(part) && onChange({ size })}
          />
        </label>
      )}

      {preset.profiles && preset.profiles.length > 1 && (
        <label className={styles.row}>
          <span className={styles.muted}>over the day</span>
          <select
            className={styles.select}
            value={part.profile ?? preset.profiles[0]}
            onChange={(e) => onChange({ profile: e.target.value as ProfileId })}
          >
            {preset.profiles.map((id) => (
              <option key={id} value={id}>
                {PROFILES[id].label}
              </option>
            ))}
          </select>
        </label>
      )}

      {preset.switch && (
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={on}
            onChange={() => onChange({ on: !on })}
          />
          <span>{preset.switch.on}</span>
        </label>
      )}

      <h3 className={styles.subhead}>Wiring</h3>
      {wires.length === 0 && <p className={styles.p}>Not connected yet.</p>}
      <ul className={styles.wires}>
        {wires.map((l) => {
          const other = spec.parts.find(
            (p) => p.id === (l.from === part.id ? l.to : l.from),
          )
          const both = spec.links.some(
            (x) => x.from === l.to && x.to === l.from,
          )
          const arrow = both ? '⇄' : l.from === part.id ? '→' : '←'
          const pts = scene.links.find(
            (x) => x.from === l.from && x.to === l.to,
          )
          const bent = !!(pts && (pts.via || pts.bend))
          return (
            <li key={`${l.from}>${l.to}`}>
              <span>
                {arrow} {other ? labelOf(other) : '?'}{' '}
                <span className={styles.muted}>· {DOMAIN_NAMES[l.domain]}</span>
              </span>
              <span className={styles.wireTools}>
                {bent && (
                  <button
                    type="button"
                    title="Turn the corner the other way"
                    aria-label="Flip the corner"
                    onClick={() => onFlip(l, pts?.bend === 'vh' ? 'hv' : 'vh')}
                  >
                    ↻
                  </button>
                )}
                <button
                  type="button"
                  title="Disconnect"
                  aria-label={`Disconnect ${other ? labelOf(other) : ''}`}
                  onClick={() => onRemoveLink(l)}
                >
                  ✕
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.tool}
          aria-pressed={linking}
          onClick={onConnect}
        >
          connect to…
        </button>
        <button type="button" className={styles.tool} onClick={onDelete}>
          remove
        </button>
      </div>

      {state && scenePart && (
        <>
          <h3 className={styles.subhead}>Right now</h3>
          <dl className={styles.table}>
            {details(scene, scenePart, state).map(([k, v], i) => (
              <div key={i}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}

function CopyButton({
  label,
  text,
  event,
  title,
}: {
  label: string
  text: () => string
  event: string
  title?: string
}) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1600)
    return () => clearTimeout(t)
  }, [done])
  return (
    <button
      type="button"
      className={styles.tool}
      title={title}
      onClick={() => {
        void navigator.clipboard?.writeText(text()).then(() => setDone(true))
        capture(event)
      }}
    >
      {done ? 'copied' : label}
    </button>
  )
}
