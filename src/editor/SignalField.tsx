// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useId, useState } from 'react'

import type { Signal } from '../sim/types.ts'
import type { Doc } from './doc.ts'
import { checkSignal } from './signal.ts'
import styles from './Editor.module.css'

/*
 * One signal, as a number or an expression. It is checked on every key: a
 * mistake is named under the field while you type, and the field only writes
 * to the sheet once what it holds would run. Beside it, the day it comes to.
 */

export function SignalField({
  label,
  value,
  doc,
  onCommit,
}: {
  label: string
  value: Signal | undefined
  doc: Doc
  onCommit: (value: number | string) => void
}) {
  const id = useId()
  const shown = typeof value === 'function' ? '' : String(value ?? '')
  const [text, setText] = useState(shown)
  const check = checkSignal(text, doc)
  const commit = () => {
    if (check.ok && check.value !== undefined && String(check.value) !== shown)
      onCommit(check.value)
  }
  return (
    <div className={styles.signal}>
      <label className={styles.signalHead} htmlFor={id}>
        <span>{label}</span>
        {check.day && <Spark values={check.day} />}
      </label>
      <input
        id={id}
        className={check.ok ? styles.expr : `${styles.expr} ${styles.exprBad}`}
        value={text}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={!check.ok}
        aria-describedby={check.ok ? undefined : `${id}-why`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setText(shown)
        }}
      />
      {!check.ok && (
        <p id={`${id}-why`} className={styles.exprWhy} role="status">
          {check.message}
          {check.at !== undefined && ` (at character ${check.at + 1})`}
        </p>
      )}
    </div>
  )
}

/** the day a signal comes to, hour by hour */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1e-9)
  const min = Math.min(0, ...values)
  const pts = values
    .map(
      (v, h) => `${(h / 23) * 60},${16 - ((v - min) / (max - min || 1)) * 14}`,
    )
    .join(' ')
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 60 18"
      role="img"
      aria-label={`over the day: ${Math.round(min * 100) / 100} to ${Math.round(max * 100) / 100}`}
    >
      <polyline points={pts} />
    </svg>
  )
}
