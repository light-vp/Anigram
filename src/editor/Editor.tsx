// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { capture } from '../app/analytics'
import { Alerts } from '../app/panels'
import { StoryboardDialog } from '../app/StoryboardDialog'
import { SiteHeader } from '../site/SiteHeader.tsx'
import { validateScene } from '../format/validate.ts'
import type { Scene } from '../sim/types.ts'
import { autoLayout, withLayout } from '../view/autoLayout.ts'
import type { ThemeId } from '../view/palette.ts'
import { Canvas } from './Canvas.tsx'
import { keepClock } from './clock.ts'
import type { Drop } from './Canvas.tsx'
import { Checks } from './Checks.tsx'
import {
  connect,
  instrumentAt,
  moveInstrument,
  movePart,
  partAt,
  patchInstrument,
  patchSheet,
  removeInstrument,
  removeLink,
  removePart,
} from './doc.ts'
import type { Doc } from './doc.ts'
import * as history from './history.ts'
import {
  InstrumentPanel,
  LinkPanel,
  PartPanel,
  SheetPanel,
} from './Inspector.tsx'
import type { Selection } from './selection.ts'
import { LEGACY_STORE } from './legacy.ts'
import {
  STARTERS,
  STORE,
  accept,
  editLink,
  fileOf,
  initialDoc,
  viewLink,
} from './open.ts'
import type { Opened } from './open.ts'
import { Palette } from './Palette.tsx'
import { findItem, place, placeInstrument } from './practice.ts'
import styles from './Editor.module.css'

/*
 * The editor. It edits a scene file, the same JSON the MCP server writes and
 * the app opens, so a person and an assistant can take turns on one file:
 * open what an assistant wrote, change it, save it, hand it back. Pick a part
 * and drop it on a square; drag one part onto another to connect them, or
 * onto an empty square to move it. Every edit re-runs the sheet at the same
 * time of day, and the checks beside it say what the MCP server would.
 */

export interface EditorProps {
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
  /** false inside the portfolio's iframe, which has its own header */
  header: boolean
}

export function Editor(props: EditorProps) {
  const [opened, setOpened] = useState<Opened | null>(null)
  useEffect(() => {
    let live = true
    let storage: Storage | null = null
    try {
      storage = window.localStorage
    } catch {
      // storage blocked: open without what was kept
    }
    void initialDoc(window.location, storage).then((o) => {
      if (!live) return
      setOpened(o)
      capture('editor_opened', { from: o.from })
    })
    return () => {
      live = false
    }
  }, [])
  if (!opened)
    return (
      <p className={styles.opening} aria-live="polite">
        Opening the sheet…
      </p>
    )
  return <Editing {...props} opened={opened} />
}

/** a sheet with nothing on it yet, which the validator won't run */
const emptyScene = (doc: Doc): Scene => ({
  id: doc.id || 'untitled',
  title: doc.title,
  subtitle: doc.subtitle ?? '',
  sheet: doc.sheet ?? 'LD-100',
  drawing: doc.drawing,
  symbols: doc.symbols,
  titleBlock: doc.titleBlock,
  size: doc.size,
  units: {},
  scale: {},
  parts: [],
  links: [],
  clock: { start: 6, rate: 1 },
})

function Editing({
  theme,
  onTheme,
  header,
  opened,
}: EditorProps & { opened: Opened }) {
  const [h, setH] = useState(() => history.start(opened.doc))
  const doc = h.now
  const [selection, setSelection] = useState<Selection | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(opened.problem ?? null)
  const [version, setVersion] = useState(0)
  const [clock] = useState(keepClock)
  const fileInput = useRef<HTMLInputElement>(null)
  const [story, setStory] = useState(false)

  const validation = useMemo(() => validateScene(doc), [doc])
  // the last scene that ran: what the sheet shows while the file has a problem
  const [lastGood, setLastGood] = useState(validation.scene)
  if (validation.scene && validation.scene !== lastGood)
    setLastGood(validation.scene)
  const scene =
    validation.scene ??
    (doc.parts.length ? lastGood : undefined) ??
    emptyScene(doc)

  const edit = useCallback((next: Doc) => {
    setH((old) => history.push(old, next))
    setVersion((v) => v + 1)
  }, [])
  const undo = useCallback(() => {
    setH(history.undo)
    setVersion((v) => v + 1)
  }, [])
  const redo = useCallback(() => {
    setH(history.redo)
    setVersion((v) => v + 1)
  }, [])

  // keep the sheet between visits. The old playground's copy is retired once it has
  // moved over, and after the first edit the link that opened the sheet comes off the
  // address bar, so a reload opens your work rather than the original.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE, JSON.stringify(fileOf(doc)))
      if (opened.from === 'old-save')
        window.localStorage.removeItem(LEGACY_STORE)
    } catch {
      // private window: the sheet just won't persist
    }
    const url = new URL(window.location.href)
    if (doc !== opened.doc && (url.hash || url.searchParams.has('scene'))) {
      url.hash = ''
      url.searchParams.delete('scene')
      window.history.replaceState(null, '', url)
    }
  }, [doc, opened])

  // a selection can outlive what it selected through undo
  const gone =
    !!selection &&
    ((selection.kind === 'part' &&
      !doc.parts.some((p) => p.id === selection.id)) ||
      (selection.kind === 'link' && !doc.links[selection.index]) ||
      (selection.kind === 'instrument' &&
        !(doc.instruments ?? [])[selection.index]))
  if (gone) setSelection(null)

  const removeSelected = useCallback(() => {
    if (!selection) return
    if (selection.kind === 'part') edit(removePart(doc, selection.id))
    if (selection.kind === 'link') edit(removeLink(doc, selection.index))
    if (selection.kind === 'instrument')
      edit(removeInstrument(doc, selection.index))
    setSelection(null)
  }, [doc, selection, edit])

  // keys: escape lets go, delete removes, ⌘Z / ⌘⇧Z step through history
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, dialog')) return
      if (e.key === 'Escape') {
        setArmed(null)
        setLinkFrom(null)
        setSelection(null)
        setNote(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        removeSelected()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, removeSelected, undo, redo])

  const link = (from: string, to: string) => {
    const r = connect(doc, from, to)
    if ('error' in r) return setNote(r.error)
    edit(r.doc)
    setNote(null)
    capture('editor_linked')
  }

  const onDrop = (drop: Drop) => {
    const here = partAt(doc, drop.cell)
    const inst = instrumentAt(doc, drop.cell)
    if (drop.kind === 'drag-part') {
      if (here && here.id !== drop.id) link(drop.id, here.id)
      else if (!here && inst < 0) edit(movePart(doc, drop.id, drop.cell))
      return
    }
    if (drop.kind === 'drag-instrument') {
      const it = doc.instruments![drop.index]!
      if (!here && inst < 0) edit(moveInstrument(doc, drop.index, drop.cell))
      else if (here) {
        // a controller dropped on a valve drives it; anything else measures what it lands on
        const drives =
          /C/.test(it.tag.split('-')[0]!.slice(1)) &&
          here.behaviour.role === 'gate'
        edit(
          patchInstrument(
            doc,
            drop.index,
            drives ? { drives: here.id } : { measures: here.id },
          ),
        )
        setNote(
          drives
            ? `${it.tag} now drives ${here.tag ?? here.label}.`
            : `${it.tag} now measures ${here.tag ?? here.label}.`,
        )
      }
      return
    }
    if (armed) {
      const item = findItem(doc.drawing, armed)
      if (!item) return setArmed(null)
      if (item.letters) {
        const r = placeInstrument(doc, item.letters, drop.cell)
        if ('error' in r) return setNote(r.error)
        edit(r.doc)
        setSelection({ kind: 'instrument', index: r.index! })
        setNote(null)
        capture('editor_instrument_placed', { letters: item.letters })
        return
      }
      const r = place(doc, item, drop.cell)
      if ('error' in r) return setNote(r.error)
      edit(r.doc)
      setSelection({ kind: 'part', id: r.id! })
      setArmed(null)
      setNote('Now drag it onto a part to connect them.')
      capture('editor_part_placed', {
        item: item.key,
        drawing: doc.drawing ?? 'pictorial',
      })
      return
    }
    if (linkFrom) {
      if (here && here.id !== linkFrom) link(linkFrom, here.id)
      setLinkFrom(null)
      return
    }
    if (here) setSelection({ kind: 'part', id: here.id })
    else if (inst >= 0) setSelection({ kind: 'instrument', index: inst })
    else setSelection(null)
    setNote(null)
  }

  const replace = (next: Doc, how: string) => {
    edit(next)
    setSelection(null)
    setArmed(null)
    setLinkFrom(null)
    setNote(null)
    capture('editor_replaced', { how })
  }

  const openFile = async (file: File) => {
    try {
      const got = accept(JSON.parse(await file.text()))
      if (!got.doc) {
        const n = got.errors.length
        return setNote(
          `That file has ${n} problem${n === 1 ? '' : 's'}: ${got.errors.slice(0, 3).join('; ')}`,
        )
      }
      replace(got.doc, 'file')
    } catch {
      setNote('That file isn’t a scene: it doesn’t read as JSON.')
    }
  }

  const layOut = () => {
    if (!validation.scene)
      return setNote('Fix what stops the sheet running first.')
    const laid = autoLayout(validation.scene)
    edit(withLayout(doc, laid.scene))
    setNote(
      laid.moved.length
        ? `Laid out ${laid.direction === 'down' ? 'top to bottom' : 'left to right'}; ${laid.moved.length} part${laid.moved.length === 1 ? '' : 's'} moved. Undo puts them back.`
        : 'Already laid out by its flow.',
    )
    capture('editor_auto_layout')
  }

  const save = () => {
    const text = `${JSON.stringify(fileOf(doc), null, 2)}\n`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    a.download = `${doc.id || 'sheet'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    capture('editor_saved')
  }

  const selectedPart =
    selection?.kind === 'part'
      ? doc.parts.find((p) => p.id === selection.id)
      : undefined
  const editProps = {
    doc,
    edit,
    select: setSelection,
    say: setNote,
  }

  return (
    <div
      className={header ? styles.app : `${styles.app} ${styles.noHeader}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0]
        if (!file) return
        e.preventDefault()
        void openFile(file)
      }}
    >
      {header && <SiteHeader page="editor" />}

      <div className={styles.tools} role="toolbar" aria-label="Editor">
        <TitleInput
          value={doc.title}
          onCommit={(title) => edit(patchSheet(doc, { title }))}
        />
        <label className={styles.field}>
          <span className={styles.muted}>start from</span>
          <select
            className={styles.select}
            value=""
            onChange={(e) => {
              const s = STARTERS.find((x) => x.id === e.target.value)
              if (s) replace(s.doc(), `starter:${s.id}`)
            }}
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
        <button
          type="button"
          className={styles.tool}
          onClick={() => fileInput.current?.click()}
        >
          open file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openFile(f)
            e.target.value = ''
          }}
        />
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.tool}
          onClick={undo}
          disabled={!h.past.length}
          title="Undo (⌘Z)"
        >
          undo
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={redo}
          disabled={!h.future.length}
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
        <button
          type="button"
          className={styles.tool}
          disabled={!validation.scene || !doc.parts.length}
          onClick={() => {
            setStory(true)
            capture('storyboard_opened', { scene: doc.id, from: 'editor' })
          }}
          title="The moments that tell the day, and the day as a GIF or MP4"
        >
          storyboard
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={save}
          title="The scene file: the same JSON an assistant writes with the MCP server"
        >
          save file
        </button>
        <CopyButton
          label="copy link"
          text={() => editLink(doc, window.location)}
          event="editor_link_copied"
          title="A link that opens this sheet in the editor"
        />
        <CopyButton
          label="copy view link"
          text={() => viewLink(doc, window.location)}
          event="editor_view_link_copied"
          title="A link that shows this sheet running, without the editor"
        />
      </div>

      <div className={styles.main}>
        <Palette
          theme={theme}
          drawing={doc.drawing}
          symbols={doc.symbols ?? 'iec'}
          armed={armed}
          onArm={(k) => {
            setArmed((a) => (a === k ? null : k))
            setLinkFrom(null)
            setNote(null)
          }}
        />

        <Canvas
          key={version}
          doc={doc}
          scene={scene}
          theme={theme}
          clock={clock}
          selected={selectedPart?.id ?? null}
          armed={armed}
          linkFrom={linkFrom}
          onDrop={onDrop}
          note={note}
        >
          {(frame) => (
            <aside className={styles.side}>
              {selectedPart ? (
                <PartPanel
                  key={selectedPart.id}
                  {...editProps}
                  part={selectedPart}
                  scene={scene}
                  frame={frame}
                  linking={linkFrom === selectedPart.id}
                  onConnect={() => {
                    setLinkFrom(
                      linkFrom === selectedPart.id ? null : selectedPart.id,
                    )
                    setArmed(null)
                    setNote('Click the part it should feed.')
                  }}
                />
              ) : selection?.kind === 'link' ? (
                <LinkPanel
                  key={`link-${selection.index}`}
                  {...editProps}
                  index={selection.index}
                />
              ) : selection?.kind === 'instrument' ? (
                <InstrumentPanel
                  key={`inst-${selection.index}`}
                  {...editProps}
                  index={selection.index}
                />
              ) : (
                <SheetPanel {...editProps} onLayout={layOut} />
              )}
              <Checks
                doc={doc}
                validation={validation}
                scene={scene}
                onSelect={setSelection}
              />
              <Alerts
                frame={frame}
                onSelect={(id) => setSelection({ kind: 'part', id })}
              />
              {!selection && (
                <section className={styles.card}>
                  <h2 className={styles.h}>How it works</h2>
                  <ol className={styles.steps}>
                    <li>
                      Pick a part on the left, then click an empty square.
                    </li>
                    <li>
                      Drag one part onto another to connect them. Drag to an
                      empty square to move it.
                    </li>
                    <li>
                      Click a part to size it, tag it or write its signals.
                    </li>
                    <li>
                      Save the file, or open one an assistant wrote: it is the
                      same JSON.
                    </li>
                  </ol>
                  <p className={styles.more}>
                    Or have your coding assistant draw it with the{' '}
                    <a href="./?docs#mcp">MCP server</a>. More in the{' '}
                    <a href="./?docs">docs</a>.
                  </p>
                </section>
              )}
            </aside>
          )}
        </Canvas>
      </div>
      {story && validation.scene && (
        <StoryboardDialog
          scene={validation.scene}
          controls={NO_CONTROLS}
          theme={theme}
          onClose={() => setStory(false)}
        />
      )}
    </div>
  )
}

/** the editor's storyboard runs the sheet's own settings */
const NO_CONTROLS = {}

function TitleInput({
  value,
  onCommit,
}: {
  value: string
  onCommit: (v: string) => void
}) {
  const [text, setText] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) {
    setWas(value)
    setText(value)
  }
  return (
    <label className={styles.field}>
      <input
        className={styles.title}
        value={text}
        maxLength={80}
        aria-label="Sheet title"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && text !== value && onCommit(text)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}

function CopyButton({
  label,
  text,
  event,
  title,
}: {
  label: string
  text: () => string | Promise<string>
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
        void Promise.resolve(text())
          .then((t) => navigator.clipboard?.writeText(t))
          .then(() => setDone(true))
        capture(event)
      }}
    >
      {done ? 'copied' : label}
    </button>
  )
}
