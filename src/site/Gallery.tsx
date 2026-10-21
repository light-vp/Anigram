// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useMemo, useRef, useState } from 'react'

import { capture } from '../app/analytics'
import { frameAt } from '../format/report.ts'
import { stamp } from '../format/migrate.ts'
import { HASH_KEY, encodeScene } from '../format/share.ts'
import type { DrawingType } from '../sim/types.ts'
import { Sheet } from '../view/Sheet.tsx'
import { sheetSize } from '../view/geometry.ts'
import { MCP_INSTALL } from './links.ts'
import { DRAWING_LABEL, EXAMPLES, ORIGIN_LABEL, drawingOf } from './gallery.ts'
import type { Example } from './gallery.ts'
import { SiteHeader } from './SiteHeader.tsx'
import styles from './Gallery.module.css'

/*
 * Every example sheet on one page (`?examples`): a drawing of each as it
 * stands at a telling hour, and three ways in — run it, see it as a static
 * drawing, or open it in the editor. A sheet is drawn only once it scrolls
 * near the window, so the page opens fast however many there are.
 */

const KINDS: Array<DrawingType | ''> = [
  '',
  'pictorial',
  'pid',
  'single-line',
  'pfd',
  'fluid-power',
]

export function Gallery() {
  const [kind, setKind] = useState<DrawingType | ''>('')

  useEffect(() => {
    document.title = 'Examples · Anigram'
    capture('gallery_opened', {})
  }, [])

  const present = new Set(EXAMPLES.map((e) => drawingOf(e.scene)))
  const shown = EXAMPLES.filter((e) => !kind || drawingOf(e.scene) === kind)

  return (
    <div className={styles.page}>
      <SiteHeader page="examples" />
      <main className={styles.main}>
        <h1 className={styles.title}>Examples</h1>
        <p className={styles.lede}>
          Real systems, drawn to run. Each sheet is a simulation: open one to
          watch its day, see it as a static engineering drawing, or change it in
          the editor. An assistant with the MCP server can write one from a
          sentence.
        </p>
        <div className={styles.bar}>
          <div className={styles.seg} role="group" aria-label="Kind of drawing">
            {KINDS.filter((k) => !k || present.has(k)).map((k) => (
              <button
                key={k || 'all'}
                type="button"
                aria-pressed={kind === k}
                className={kind === k ? styles.on : styles.off}
                onClick={() => setKind(k)}
              >
                {k ? DRAWING_LABEL[k] : 'All'}
              </button>
            ))}
          </div>
          <span className={styles.count}>
            {shown.length} sheet{shown.length === 1 ? '' : 's'}
          </span>
        </div>
        <ul className={styles.grid}>
          {shown.map((e) => (
            <Card key={e.scene.id} example={e} />
          ))}
        </ul>
        <p className={styles.foot}>
          Have an assistant draw yours: <code>{MCP_INSTALL}</code> ·{' '}
          <a href="./?docs#mcp">how the MCP server works</a>
        </p>
      </main>
    </div>
  )
}

interface Links {
  run: string
  still: string
  edit: string
}

/** the three ways into a sheet: by name when it is built in, whole in the link otherwise */
function useLinks(e: Example): Links | null {
  const named = useMemo<Links | null>(() => {
    if (e.file) return null
    const id = encodeURIComponent(e.scene.id)
    return {
      run: `./?scene=${id}`,
      still: `./?scene=${id}&mode=static`,
      edit: `./?build=1&scene=${id}`,
    }
  }, [e])
  const [carried, setCarried] = useState<Links | null>(null)
  useEffect(() => {
    if (!e.file) return
    let live = true
    void encodeScene(stamp(e.file as object)).then((enc) => {
      if (!live) return
      const hash = `#${HASH_KEY}=${enc}`
      setCarried({
        run: `./${hash}`,
        still: `./?mode=static${hash}`,
        edit: `./?build=1${hash}`,
      })
    })
    return () => {
      live = false
    }
  }, [e])
  return named ?? carried
}

function Card({ example: e }: { example: Example }) {
  const { scene } = e
  const links = useLinks(e)
  const drawing = drawingOf(scene)
  const go = (how: keyof Links) => () =>
    capture('gallery_example', { scene: scene.id, how })

  return (
    <li className={styles.card}>
      <a
        className={styles.thumb}
        href={links?.run}
        onClick={go('run')}
        aria-label={`Run ${scene.title}`}
      >
        <Thumb example={e} />
      </a>
      <div className={styles.body}>
        <p className={styles.meta}>
          <span>{DRAWING_LABEL[drawing]}</span>
          <span>{scene.sheet}</span>
          <span>{ORIGIN_LABEL[e.origin]}</span>
        </p>
        <h2 className={styles.name}>
          <a href={links?.run} onClick={go('run')}>
            {scene.title}
          </a>
        </h2>
        {scene.subtitle && <p className={styles.sub}>{scene.subtitle}</p>}
        <p className={styles.ways}>
          <a href={links?.run} onClick={go('run')}>
            Run
          </a>
          <a href={links?.still} onClick={go('still')}>
            Static
          </a>
          <a href={links?.edit} onClick={go('edit')}>
            Edit
          </a>
        </p>
      </div>
    </li>
  )
}

/** the sheet as it stands at the example's hour, drawn once it comes near the window */
function Thumb({ example: e }: { example: Example }) {
  const ref = useRef<HTMLDivElement>(null)
  // with no way to watch the scroll, draw it straight away
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const { w, h } = sheetSize(e.scene)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const frame = useMemo(
    () => (near ? frameAt(e.scene, e.hour) : null),
    [near, e],
  )

  return (
    <div ref={ref} className={styles.paper} style={{ aspectRatio: w / h }}>
      {frame && (
        <Sheet
          scene={e.scene}
          frame={frame}
          theme="light"
          annotate={false}
          animate={false}
          selected={null}
          credit={false}
          className={styles.sheet}
        />
      )}
    </div>
  )
}
