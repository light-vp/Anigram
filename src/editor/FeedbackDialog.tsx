// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { capture } from '../app/analytics'
import { FEEDBACK_URL } from '../site/links.ts'
import styles from './Editor.module.css'

/*
 * Help → Send feedback. The note goes to the author's site, which mails it
 * on (vaibhav.co.uk, public/api/feedback.php), so no address is in the app.
 * `website` is a field only a bot can see and `elapsed` how long the dialog
 * was open: the server quietly drops a note that fills one or rushes the
 * other.
 */

type State = 'idle' | 'sending' | 'sent' | 'busy' | 'failed'

const PROBLEM: Partial<Record<State, string>> = {
  busy: 'That is a lot of notes from here today. Try again tomorrow?',
  failed: 'That didn’t go through. Try again in a minute.',
}

export function FeedbackDialog({
  sheet,
  onClose,
}: {
  /** the open sheet's title, so a note can be read against it */
  sheet: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const trap = useRef<HTMLInputElement>(null)
  const [opened] = useState(() => performance.now())
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (state === 'sending' || message.trim().length < 3) return
    setState('sending')
    try {
      const res = await fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          email: email.trim(),
          from: 'editor',
          page: `${location.host}${location.pathname} · ${sheet}`,
          website: trap.current?.value ?? '',
          elapsed: Math.round(performance.now() - opened),
        }),
      })
      const next = res.ok ? 'sent' : res.status === 429 ? 'busy' : 'failed'
      setState(next)
      if (next === 'sent') capture('feedback_sent', { from: 'editor' })
    } catch {
      setState('failed')
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="feedback-title"
    >
      <h2 id="feedback-title" className={styles.h}>
        Send feedback
      </h2>
      {state === 'sent' ? (
        <>
          <p className={styles.more} role="status">
            Thanks, that’s with Vaibhav now. Every note gets read.
          </p>
          <form method="dialog" className={styles.actions}>
            <button type="submit" className={styles.tool} autoFocus>
              Close
            </button>
          </form>
        </>
      ) : (
        <form className={styles.feedback} onSubmit={send}>
          <p className={styles.more}>
            A bug, a part you need, a drawing that came out wrong? It goes
            straight to Vaibhav’s inbox.
          </p>
          <label className={styles.ask}>
            <span>Your note</span>
            <textarea
              rows={5}
              required
              minLength={3}
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          </label>
          <label className={styles.ask}>
            <span>Your email, if you’d like a reply</span>
            <input
              type="email"
              autoComplete="email"
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <input
            ref={trap}
            className={styles.trap}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          {PROBLEM[state] && (
            <p className={styles.problem} role="status">
              {PROBLEM[state]}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.tool}
              onClick={() => ref.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.tool} ${styles.primary}`}
              disabled={state === 'sending'}
            >
              {state === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
