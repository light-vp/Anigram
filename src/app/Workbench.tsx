// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import { sheetSize } from '../view/geometry.ts'
import type { ThemeId } from '../view/palette.ts'
import { Sheet } from '../view/Sheet.tsx'
import { capture } from './analytics'
import { downloadJson, downloadSvg } from './exportSvg'
import { useFrame, usePrefersReducedMotion, useSimulation } from './hooks'
import { frameCaption } from '../sim/captions.ts'
import { Alerts, Controls, Inspector } from './panels'
import { embedSnippet, sceneLink } from './params'
import type { Params } from './params'
import { SiteHeader } from '../site/SiteHeader.tsx'
import { StoryboardDialog } from './StoryboardDialog'
import { Transport } from './Transport'
import type { Controls as SceneControls } from '../format/report.ts'
import styles from './Workbench.module.css'

export interface WorkbenchProps {
  scene: Scene
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
  onScene: (id: string) => void
  /** a scene file the user opened or dropped, still to be validated */
  onOpen: (raw: unknown) => void
  /** why the last scene file wouldn't open */
  problem: string | null
  onDismiss: () => void
  /** false inside the portfolio's iframe, which has its own header */
  header: boolean
  initial: Params
}

/** the full app: scene tabs, the sheet, its controls and the export tools */
export function Workbench({
  scene,
  theme,
  onTheme,
  onScene,
  onOpen,
  problem,
  onDismiss,
  header,
  initial,
}: WorkbenchProps) {
  const reduced = usePrefersReducedMotion()
  const sim = useSimulation(scene, (s) => {
    if (initial.hour !== null) s.seek(initial.hour)
    if (initial.speed !== null) s.setSpeed(initial.speed)
    if (initial.paper || reduced) s.setPlaying(false)
  })
  const frame = useFrame(sim)
  const [paper, setPaper] = useState(initial.paper)
  const [selected, setSelected] = useState<string | null>(null)
  const [embedOpen, setEmbedOpen] = useState(false)
  // the controls as they were when the storyboard opened
  const [story, setStory] = useState<SceneControls | null>(null)
  const [shared, setShared] = useState(false)
  const [full, setFull] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const builtIn = SCENES.includes(scene)

  useEffect(() => {
    const onChange = () =>
      setFull(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const readFile = (file: File | undefined) => {
    if (!file) return
    file
      .text()
      .then((t) => onOpen(JSON.parse(t)))
      .catch(() => onOpen(null))
  }

  const share = async () => {
    const url = builtIn
      ? `${window.location.origin}${window.location.pathname}?scene=${scene.id}`
      : await sceneLink(scene)
    await navigator.clipboard?.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 1600)
    capture('link_copied', { scene: scene.id, builtIn })
  }

  /** the same sheet in the editor: a built-in by name, anything else whole in the link */
  const openEditor = async () => {
    const url = new URL(builtIn ? window.location.href : await sceneLink(scene))
    url.searchParams.set('build', '1')
    if (builtIn) {
      url.searchParams.set('scene', scene.id)
      url.hash = ''
    }
    capture('edit_opened', { scene: scene.id, builtIn })
    window.location.href = url.href
  }

  // paper is a still: the clock stops and every flow is labelled instead
  useEffect(() => {
    sim.animate = !paper && !reduced
    if (paper) sim.setPlaying(false)
  }, [sim, paper, reduced])

  // space plays and pauses, escape lets go of the selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, button, select, dialog')) return
      if (e.key === ' ') {
        e.preventDefault()
        sim.setPlaying(!sim.playing)
      }
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sim])

  const caption = frameCaption(scene, frame)
  const { w, h } = sheetSize(scene)
  const filename = `${scene.id}-${String(Math.floor(frame.hour)).padStart(2, '0')}${String(
    Math.floor((frame.hour % 1) * 60),
  ).padStart(2, '0')}`

  const print = () => {
    setPaper(true)
    capture('sheet_printed', { scene: scene.id })
    // let the annotated sheet render before the print dialog snapshots it
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  return (
    <div
      className={header ? styles.app : `${styles.app} ${styles.noHeader}`}
      // drop a scene file anywhere to open it
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        readFile(e.dataTransfer.files[0])
      }}
    >
      {header && <SiteHeader page="examples" />}

      <nav className={styles.tabs} aria-label="Sheets">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === scene.id ? styles.tabOn : styles.tab}
            aria-current={s.id === scene.id ? 'page' : undefined}
            onClick={() => onScene(s.id)}
          >
            <span className={styles.tabNo}>{s.sheet}</span>
            {s.title}
          </button>
        ))}
        {!builtIn && (
          <button type="button" className={styles.tabOn} aria-current="page">
            <span className={styles.tabNo}>{scene.sheet}</span>
            {scene.title}
          </button>
        )}
        <button
          type="button"
          className={styles.tab}
          onClick={() => fileRef.current?.click()}
          title="Open a scene file (.json) — or drop one anywhere on the page"
        >
          + open
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            readFile(e.currentTarget.files?.[0])
            e.currentTarget.value = ''
          }}
        />
      </nav>

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}{' '}
          <button type="button" className={styles.tool} onClick={onDismiss}>
            ok
          </button>
        </p>
      )}

      <main className={styles.main}>
        <div className={styles.stage} ref={stageRef}>
          <div className={styles.tools} role="toolbar" aria-label="Sheet">
            <div className={styles.seg} role="group" aria-label="Mode">
              <button
                type="button"
                aria-pressed={!paper}
                onClick={() => setPaper(false)}
              >
                live
              </button>
              <button
                type="button"
                aria-pressed={paper}
                onClick={() => {
                  setPaper(true)
                  capture('paper_mode', { scene: scene.id })
                }}
              >
                paper
              </button>
            </div>
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
            <span className={styles.spacer} />
            <button
              type="button"
              className={styles.tool}
              onClick={() => {
                if (svgRef.current) downloadSvg(svgRef.current, filename)
                capture('svg_exported', { scene: scene.id })
              }}
            >
              ↓ svg
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => {
                downloadJson(scene)
                capture('json_exported', { scene: scene.id })
              }}
              title="The scene file: edit it by hand, or hand it to an assistant through the MCP server"
            >
              ↓ json
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => void openEditor()}
              title="Open this sheet in the editor: move parts, tag them, write their signals, save the file"
            >
              ✎ edit
            </button>
            <button type="button" className={styles.tool} onClick={print}>
              print
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => {
                setStory({
                  knobs: { ...sim.knobs },
                  switches: { ...sim.switches },
                })
                capture('storyboard_opened', { scene: scene.id })
              }}
              title="The moments that tell the day, and the day as a GIF or MP4"
            >
              ▤ storyboard
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => void share()}
            >
              {shared ? 'link copied' : '⧉ link'}
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => setEmbedOpen(true)}
            >
              {'</>'} embed
            </button>
            {builtIn && (
              <a
                className={styles.tool}
                href={`?screen=1&scene=${scene.id}`}
                target="_blank"
                rel="noreferrer"
                title="A full-bleed dark sheet that tours every sheet — for a screen on a wall"
              >
                ▭ screen
              </a>
            )}
            <button
              type="button"
              className={styles.tool}
              aria-pressed={full}
              onClick={() => {
                if (full) void document.exitFullscreen()
                else {
                  void stageRef.current?.requestFullscreen()
                  capture('fullscreen', { scene: scene.id })
                }
              }}
            >
              {full ? '✕ exit' : '⤢ full screen'}
            </button>
          </div>

          <div
            className={styles.sheetWrap}
            // as wide as the column allows, but never taller than the window
            style={
              {
                aspectRatio: `${w} / ${h}`,
                maxWidth: `calc((100vh - 300px) * ${(w / h).toFixed(4)})`,
                '--aspect': (w / h).toFixed(4),
              } as CSSProperties
            }
          >
            <Sheet
              svgRef={svgRef}
              scene={scene}
              frame={frame}
              theme={theme}
              annotate={paper || reduced}
              credit={initial.credit}
              animate={!paper && !reduced}
              selected={selected}
              onSelect={setSelected}
              onToggle={(id) => {
                sim.toggle(id)
                capture('part_toggled', { scene: scene.id, switch: id })
              }}
              className={styles.sheet}
            />
          </div>

          <p className={styles.caption} aria-live="polite">
            {caption ?? ' '}
          </p>
          <Transport sim={sim} frame={frame} />
        </div>

        <aside className={styles.side}>
          <Inspector scene={scene} frame={frame} selected={selected} />
          <Alerts frame={frame} onSelect={setSelected} />
          <Controls scene={scene} sim={sim} />
        </aside>
      </main>

      {story && (
        <StoryboardDialog
          scene={scene}
          controls={story}
          theme={theme}
          onClose={() => setStory(null)}
        />
      )}
      {embedOpen && (
        <EmbedDialog
          snippet={embedSnippet(scene.id, scene.title, w / h)}
          onClose={() => setEmbedOpen(false)}
        />
      )}
    </div>
  )
}

function EmbedDialog({
  snippet,
  onClose,
}: {
  snippet: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <h2>Put this sheet on a page</h2>
      <p>
        It runs live inside the frame. Add <code>&amp;t=18</code> to open it at
        6pm, <code>&amp;mode=paper</code> for a labelled still, or{' '}
        <code>&amp;theme=dark</code> for a dark sheet.
      </p>
      <textarea
        readOnly
        value={snippet}
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className={styles.dialogRow}>
        <button
          type="button"
          className={styles.tool}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(snippet)
              .then(() => setCopied(true))
            capture('embed_copied')
          }}
        >
          {copied ? 'copied' : 'copy'}
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={() => ref.current?.close()}
        >
          close
        </button>
      </div>
    </dialog>
  )
}
