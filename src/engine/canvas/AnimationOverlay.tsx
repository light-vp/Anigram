// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { ViewportPortal } from '@xyflow/react'
import { useCallback } from 'react'

import { Scheduler } from '../animation/scheduler'
import styles from './AnimationOverlay.module.css'

/**
 * The imperative animation layer. It renders a container INTO React Flow's
 * transformed viewport (via ViewportPortal), so sprites live in flow coordinates
 * and pan/zoom for free. A single Scheduler drives it outside React.
 *
 * We start the scheduler from a CALLBACK REF (not a []-effect): ViewportPortal
 * mounts its child after the parent effect runs, so the element attaches late —
 * the callback ref fires exactly when it does, and its cleanup stops it.
 */
export function AnimationOverlay() {
  const attach = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const scheduler = new Scheduler(el)
    scheduler.start()
    return () => scheduler.stop()
  }, [])

  return (
    <ViewportPortal>
      <div ref={attach} className={styles.layer} />
    </ViewportPortal>
  )
}
