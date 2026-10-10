// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useCallback, useEffect, useState } from 'react'

import { Builder } from '../build/Builder'
import { SCENES, findScene } from '../scenes/index.ts'
import type { ThemeId } from '../view/palette.ts'
import { capture } from './analytics'
import { readParams, writeSceneParam } from './params'
import { EmbedView, ScreenView } from './views'
import { Workbench } from './Workbench'

const initial = readParams()

/** Picks the view from the URL and owns which sheet is showing. */
export function App() {
  const [scene, setScene] = useState(() => findScene(initial.scene))
  const [theme, setTheme] = useState<ThemeId>(
    initial.theme ?? (initial.view === 'screen' ? 'dark' : 'light'),
  )

  // the chrome around the sheet follows its colour
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.title = `${scene.title} · Anigram`
    capture('scene_loaded', { scene: scene.id, view: initial.view })
  }, [scene])

  const pick = useCallback((id: string) => {
    setScene(findScene(id))
    writeSceneParam(id)
  }, [])

  const next = useCallback(() => {
    setScene((s) => SCENES[(SCENES.indexOf(s) + 1) % SCENES.length]!)
  }, [])

  if (initial.view === 'build' || initial.view === 'build-embed')
    return (
      <Builder
        theme={theme}
        onTheme={setTheme}
        header={initial.view === 'build'}
      />
    )
  if (initial.view === 'embed')
    return (
      <EmbedView key={scene.id} scene={scene} theme={theme} initial={initial} />
    )
  if (initial.view === 'screen')
    return (
      <ScreenView key={scene.id} scene={scene} theme={theme} onDone={next} />
    )
  return (
    <Workbench
      key={scene.id}
      scene={scene}
      theme={theme}
      onTheme={setTheme}
      onScene={pick}
      header={initial.view === 'app'}
      initial={initial}
    />
  )
}
