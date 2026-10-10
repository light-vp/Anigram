// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useCallback, useEffect, useState } from 'react'

import { Builder } from '../build/Builder'
import { SCENES, findScene } from '../scenes/index.ts'
import type { ThemeId } from '../view/palette.ts'
import { decodeScene, sceneFromHash } from '../format/share.ts'
import { validateScene } from '../format/validate.ts'
import { capture } from './analytics'
import { readParams, writeSceneHash, writeSceneParam } from './params'
import { EmbedView, ScreenView } from './views'
import { Workbench } from './Workbench'

const initial = readParams()

/** Picks the view from the URL and owns which sheet is showing. */
export function App() {
  const [scene, setScene] = useState(() => findScene(initial.scene))
  // bumped for every scene opened, so even one reusing a built-in id gets a fresh simulation
  const [opened, setOpened] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
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

  /** a scene file from anywhere — a link, a dropped file — checked before it runs */
  const open = useCallback((raw: unknown, from: 'link' | 'file') => {
    const v = validateScene(raw)
    if (!v.scene) {
      const n = v.errors.length
      setProblem(
        `That scene ${from} has ${n} problem${n === 1 ? '' : 's'}: ${v.errors.slice(0, 3).join('; ')}`,
      )
      return
    }
    setScene(v.scene)
    setOpened((n) => n + 1)
    setProblem(null)
    capture('scene_opened', { from, parts: v.scene.parts.length })
    if (from === 'file') void writeSceneHash(v.scene)
  }, [])

  // #scene=… carries a whole scene file; it wins over ?scene=
  useEffect(() => {
    const encoded = sceneFromHash(window.location.hash)
    if (!encoded) return
    decodeScene(encoded)
      .then((raw) => open(raw, 'link'))
      .catch(() =>
        setProblem('That scene link is damaged — it may have been cut short.'),
      )
  }, [open])

  const pick = useCallback((id: string) => {
    setScene(findScene(id))
    setProblem(null)
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
      key={`${scene.id}:${opened}`}
      scene={scene}
      theme={theme}
      onTheme={setTheme}
      onScene={pick}
      onOpen={(raw) => open(raw, 'file')}
      problem={problem}
      onDismiss={() => setProblem(null)}
      header={initial.view === 'app'}
      initial={initial}
    />
  )
}
