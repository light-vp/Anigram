// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect } from 'react'

import {
  DiagramCanvas,
  getNodeKinds,
  getScene,
  Inspector,
  loadScene,
  Palette,
  SourceLink,
  useSimStore,
} from '../engine'
import styles from './App.module.css'

/**
 * Chrome-less embed for the portfolio iframe (?embed=presentation&scene=<id>):
 * just the canvas + presentation, plus the AGPL §13 source link.
 */
function EmbedView({ sceneId }: { sceneId: string | null }) {
  const startPresentation = useSimStore((s) => s.startPresentation)

  useEffect(() => {
    const scene = sceneId ? getScene(sceneId) : undefined
    if (scene) {
      loadScene(scene)
      startPresentation(scene.id, scene.sequence)
    }
  }, [sceneId, startPresentation])

  return (
    <div className={styles.embed}>
      <DiagramCanvas chrome={false} />
      <SourceLink floating />
    </div>
  )
}

/**
 * App shell: palette + canvas + inspector. Switches to a chrome-less embed when
 * the URL carries an `embed` param.
 */
export function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('embed')) {
    return <EmbedView sceneId={params.get('scene')} />
  }

  const kindCount = getNodeKinds().length

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>
          living<span className={styles.accent}>·</span>diagrams
        </h1>
        <p className={styles.status}>
          {kindCount} kinds · the connection is the meaning
        </p>
        <span className={styles.headerRight}>
          <SourceLink />
        </span>
      </header>

      <div className={styles.body}>
        <Palette />
        <DiagramCanvas />
        <Inspector />
      </div>
    </div>
  )
}
