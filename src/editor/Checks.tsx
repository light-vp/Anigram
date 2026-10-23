// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useMemo } from 'react'

import { checkExpectations } from '../format/expect.ts'
import type { DayReport } from '../format/report.ts'
import type { Validation } from '../format/validate.ts'
import { drawingFindings } from '../packs/checks.ts'
import type { Scene } from '../sim/types.ts'
import { lintLayout } from '../view/lint.ts'
import type { Doc } from './doc.ts'
import { selectionOf } from './selection.ts'
import type { Selection } from './selection.ts'
import styles from './Editor.module.css'

/*
 * Everything the MCP server would tell an assistant about this sheet, shown
 * while you edit: what stops it running, whether its story holds, what a
 * reviewing engineer would mark up, and where it doesn't read cleanly. Each
 * line says what to do, and clicking it selects what it is about.
 */

interface Line {
  text: string
  path?: string
}

const split = (s: string): Line => {
  const at = s.indexOf(': ')
  return at > 0 ? { path: s.slice(0, at), text: s } : { text: s }
}

export function Checks({
  doc,
  validation,
  scene,
  day,
  onSelect,
}: {
  doc: Doc
  validation: Validation
  /** the scene as it last ran, when the file as it stands doesn't */
  scene: Scene | undefined
  /** the file's simulated day, when it runs and has checks to make */
  day: DayReport | undefined
  onSelect: (s: Selection) => void
}) {
  const ok = !!validation.scene
  const story = useMemo(() => {
    if (!ok || !day || !scene?.expect?.length) return []
    return checkExpectations(scene, day)
  }, [ok, scene, day])
  const groups = useMemo(() => {
    const live = ok ? scene : undefined
    const sections: Array<{
      title: string
      tone: 'bad' | 'warn' | 'ok'
      lines: Line[]
    }> = []
    if (!ok && doc.parts.length)
      sections.push({
        title: 'Won’t run',
        tone: 'bad',
        lines: validation.errors.map(split),
      })
    if (story.length)
      sections.push({
        title: `Story · ${story.filter((r) => r.ok).length} of ${story.length} hold`,
        tone: story.every((r) => r.ok) ? 'ok' : 'warn',
        lines: story.map((r) => ({
          text: `${r.ok ? '✓' : '✗'} ${r.says}${
            r.ok
              ? ''
              : `: fails at ${r.failed
                  .slice(0, 4)
                  .map((h) => `${h}:00`)
                  .join(', ')}`
          }`,
        })),
      })
    if (live && live.drawing && live.drawing !== 'pictorial') {
      const f = drawingFindings(live)
      sections.push({
        title: f.length
          ? `Drawing practice · ${f.length} to mark up`
          : 'Drawing practice · nothing to mark up',
        tone: f.length ? 'warn' : 'ok',
        lines: f.map((x) => ({ text: x.message, path: x.path })),
      })
    }
    if (live) {
      const l = lintLayout(live)
      sections.push({
        title: l.length
          ? `Layout · ${l.length} to tidy`
          : 'Layout · reads cleanly',
        tone: l.length ? 'warn' : 'ok',
        lines: l.map((x) => ({ text: x.message, path: x.path })),
      })
    }
    if (validation.warnings.length)
      sections.push({
        title: 'Worth a look',
        tone: 'warn',
        lines: validation.warnings.map(split),
      })
    return sections
  }, [ok, scene, story, validation, doc.parts.length])

  if (!groups.length) return null
  return (
    <section className={styles.card} aria-label="Checks">
      <h2 className={styles.h}>Checks</h2>
      {groups.map((g) => (
        <details
          key={g.title}
          className={styles.check}
          open={g.tone === 'bad' || (g.tone === 'warn' && g.lines.length <= 4)}
        >
          <summary data-tone={g.tone}>{g.title}</summary>
          <ul>
            {g.lines.map((line, i) => {
              const target = line.path ? selectionOf(line.path, doc) : null
              return (
                <li key={i}>
                  {target ? (
                    <button type="button" onClick={() => onSelect(target)}>
                      {line.text}
                    </button>
                  ) : (
                    line.text
                  )}
                </li>
              )
            })}
          </ul>
        </details>
      ))}
    </section>
  )
}
