// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'

import type { Controls } from '../format/report.ts'
import type { Scene } from '../sim/types.ts'
import type { ThemeId } from '../view/palette.ts'
import { capture } from './analytics'
import styles from './StoryboardDialog.module.css'

type Recorder = typeof import('./recorder.ts')

/** the board and the encoders, fetched the first time the dialog opens */
let loading: Promise<Recorder> | undefined
const recorder = () => (loading ??= import('./recorder.ts'))

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * The day as a storyboard: the moments that tell it, picked from what the
 * sheet really did, and the day itself as a GIF or MP4 to drop into a post,
 * a slide or a README. Everything is made here in the browser, with the
 * controls as they are set now.
 */
export function StoryboardDialog({
  scene,
  controls,
  theme,
  onClose,
}: {
  scene: Scene
  controls: Controls
  theme: ThemeId
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [board, setBoard] = useState<{ url: string; svg: string; n: number }>()
  const [mp4, setMp4] = useState(false)
  const [busy, setBusy] = useState<{
    what: string
    done: number
    total: number
  }>()
  const [problem, setProblem] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    ref.current?.showModal()
    let url = ''
    let live = true
    void recorder().then(async (r) => {
      const b = r.makeBoard(scene, controls)
      const svg = r.boardSvg(scene, b, controls, theme)
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      const canMp4 = await r.canRecordMp4()
      if (!live) return URL.revokeObjectURL(url)
      setBoard({ url, svg, n: b.panels.length })
      setMp4(canMp4)
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
      abort.current?.abort()
    }
  }, [scene, controls, theme])

  const make = async (what: 'gif' | 'mp4') => {
    const r = await recorder()
    const ac = new AbortController()
    abort.current = ac
    setProblem(null)
    setBusy({ what, done: 0, total: 1 })
    try {
      const opts = {
        ...controls,
        theme,
        signal: ac.signal,
        onProgress: (done: number, total: number) =>
          setBusy({ what, done, total }),
      }
      const blob =
        what === 'gif'
          ? await r.recordGif(scene, opts)
          : await r.recordMp4(scene, opts)
      save(blob, `${scene.id}.${what}`)
      capture('recording_exported', { scene: scene.id, format: what })
    } catch (e) {
      if (!ac.signal.aborted) setProblem((e as Error).message)
    } finally {
      setBusy(undefined)
      abort.current = null
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      aria-labelledby="storyboard-title"
    >
      <div className={styles.head}>
        <h2 id="storyboard-title">Storyboard</h2>
      </div>
      <p className={styles.lede}>
        The moments that tell this sheet’s day, picked from what it did: the
        first time each event fires, and its captions between. Record the day
        and it slows down for each one.
      </p>
      <div className={styles.board}>
        {board ? (
          <img
            src={board.url}
            alt={`${scene.title}: a storyboard of ${board.n} moments`}
          />
        ) : (
          <p className={styles.empty}>Running the day…</p>
        )}
      </div>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.tool}
          disabled={!board || !!busy}
          onClick={() => void make('gif')}
        >
          ↓ gif
        </button>
        <button
          type="button"
          className={styles.tool}
          disabled={!board || !!busy || !mp4}
          title={
            mp4
              ? undefined
              : 'This browser can’t encode H.264 video; the GIF works everywhere'
          }
          onClick={() => void make('mp4')}
        >
          ↓ mp4
        </button>
        <button
          type="button"
          className={styles.tool}
          disabled={!board}
          onClick={() => {
            if (!board) return
            save(
              new Blob([board.svg], { type: 'image/svg+xml' }),
              `${scene.id}-storyboard.svg`,
            )
            capture('storyboard_exported', { scene: scene.id })
          }}
        >
          ↓ storyboard
        </button>
        {busy && (
          <>
            <span className={styles.status} aria-live="polite">
              recording {busy.what} ·{' '}
              {Math.round((100 * busy.done) / busy.total)}%
            </span>
            <span className={styles.progress} aria-hidden="true">
              <span style={{ width: `${(100 * busy.done) / busy.total}%` }} />
            </span>
            <button
              type="button"
              className={styles.tool}
              onClick={() => abort.current?.abort()}
            >
              stop
            </button>
          </>
        )}
        {problem && (
          <span className={styles.status} role="alert">
            {problem}
          </span>
        )}
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.tool}
          disabled={!!busy}
          onClick={() => ref.current?.close()}
        >
          close
        </button>
      </div>
    </dialog>
  )
}
