// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { capture } from '../app/analytics'
import { SECTIONS } from './docsContent.ts'
import type { Block } from './docsContent.ts'
import { SiteHeader } from './SiteHeader.tsx'
import styles from './Docs.module.css'

/*
 * How Anigram works, on one page: a contents column that follows the
 * reading, and the sections from docsContent.ts. `?docs#mcp` opens at the
 * MCP server.
 */
export function Docs() {
  const [current, setCurrent] = useState(SECTIONS[0]!.id)

  useEffect(() => {
    capture('docs_opened', { section: window.location.hash.slice(1) || null })
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  // the contents column marks the section being read: the last one whose
  // heading has reached the top third of the window
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const line = window.innerHeight / 3
      let at = SECTIONS[0]!.id
      for (const sec of SECTIONS) {
        const el = document.getElementById(sec.id)
        if (el && el.getBoundingClientRect().top <= line) at = sec.id
      }
      setCurrent(at)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className={styles.page}>
      <SiteHeader page="docs" />
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Contents">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={s.id === current ? styles.tocOn : styles.tocLink}
            >
              {s.title}
            </a>
          ))}
        </nav>
        <main className={styles.main}>
          <h1 className={styles.title}>Anigram docs</h1>
          <p className={styles.lede}>
            How the drawings run, how to draw one by hand or have an assistant
            draw it, and how to put it to work.
          </p>
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className={styles.section}>
              <h2 className={styles.h2}>
                <a href={`#${s.id}`}>{s.title}</a>
              </h2>
              {s.blocks.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <p className={styles.p}>{inline(block.p)}</p>
  if ('h' in block) return <h3 className={styles.h3}>{block.h}</h3>
  if ('list' in block)
    return (
      <ul className={styles.list}>
        {block.list.map((x, i) => (
          <li key={i}>{inline(x)}</li>
        ))}
      </ul>
    )
  if ('steps' in block)
    return (
      <ol className={styles.list}>
        {block.steps.map((x, i) => (
          <li key={i}>{inline(x)}</li>
        ))}
      </ol>
    )
  if ('code' in block) return <Code text={block.code} />
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {block.table.head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{inline(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className={styles.code}>
      <pre>
        <code>{text}</code>
      </pre>
      <button
        type="button"
        className={styles.copy}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true))
          capture('docs_code_copied')
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  )
}

/** `code`, **bold** and [links](url), as Markdown writes them */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let k = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<code key={k++}>{m[1]}</code>)
    else if (m[2] !== undefined) out.push(<strong key={k++}>{m[2]}</strong>)
    else {
      const external = /^https?:/.test(m[4]!)
      out.push(
        <a
          key={k++}
          href={m[4]}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {m[3]}
        </a>,
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
