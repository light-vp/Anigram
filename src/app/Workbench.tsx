// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'

import { SCENES } from '../scenes/index.ts'
import type { Scene } from '../sim/types.ts'
import { sheetSize } from '../view/geometry.ts'
import type { ThemeId } from '../view/palette.ts'
import { Sheet } from '../view/Sheet.tsx'
import { capture } from './analytics'
import { downloadSvg } from './exportSvg'
import { useFrame, usePrefersReducedMotion, useSimulation } from './hooks'
import { captionAt } from '../sim/captions.ts'
import { Alerts, Controls, Inspector } from './panels'
import { embedSnippet } from './params'
import type { Params } from './params'
import { REPO_URL } from './SourceLink'
import { Transport } from './Transport'
import styles from './Workbench.module.css'

export interface WorkbenchProps {
  scene: Scene
  theme: ThemeId
  onTheme: (theme: ThemeId) => void
  onScene: (id: string) => void
  /** false inside the portfolio's playground iframe, which has its own header */
  header: boolean
  initial: Params
}

/** the full app: scene tabs, the sheet, its controls and the export tools */
export function Workbench({
  scene,
  theme,
  onTheme,
  onScene,
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
  const svgRef = useRef<SVGSVGElement>(null)

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

  const caption = captionAt(scene, frame.hour)
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
    <div className={header ? styles.app : `${styles.app} ${styles.noHeader}`}>
      {header && (
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.logo} aria-hidden="true">
              ⚙
            </span>
            <span>
              <strong>Anigram</strong>
              <span className={styles.tag}>
                living diagrams of real machines
              </span>
            </span>
          </div>
          <a
            className={styles.source}
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            source ↗
          </a>
        </header>
      )}

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
      </nav>

      <main className={styles.main}>
        <div className={styles.stage}>
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
                aria-pressed={theme === 'paper'}
                onClick={() => onTheme('paper')}
              >
                cream
              </button>
              <button
                type="button"
                aria-pressed={theme === 'blueprint'}
                onClick={() => onTheme('blueprint')}
              >
                blueprint
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
            <button type="button" className={styles.tool} onClick={print}>
              print
            </button>
            <button
              type="button"
              className={styles.tool}
              onClick={() => setEmbedOpen(true)}
            >
              {'</>'} embed
            </button>
            <a
              className={styles.tool}
              href={`?screen=1&scene=${scene.id}`}
              target="_blank"
              rel="noreferrer"
              title="Full-bleed blueprint that tours every sheet — for a screen on a wall"
            >
              ▭ screen
            </a>
          </div>

          <div
            className={styles.sheetWrap}
            // as wide as the column allows, but never taller than the window
            style={{
              aspectRatio: `${w} / ${h}`,
              maxWidth: `calc((100vh - 300px) * ${(w / h).toFixed(4)})`,
            }}
          >
            <Sheet
              svgRef={svgRef}
              scene={scene}
              frame={frame}
              theme={theme}
              annotate={paper || reduced}
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
        <code>&amp;theme=blueprint</code> for a dark sheet.
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
