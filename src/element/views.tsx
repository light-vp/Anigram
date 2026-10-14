// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect } from 'react'

import type { Params } from '../app/params.ts'
import { EmbedView } from '../app/views.tsx'
import type { Scene } from '../sim/types.ts'
import type { ThemeId } from '../view/palette.ts'

/** what <living-diagram> renders in its shadow root: the sheet, or what is wrong */

export interface LoadDetail {
  id: string
  title: string
}

export interface ErrorDetail {
  message: string
  errors: string[]
}

export function Shown({
  scene,
  theme,
  settings,
  generation,
  onShown,
}: {
  scene: Scene
  theme: ThemeId
  settings: Params
  generation: number
  onShown: (scene: Scene) => void
}) {
  // once the sheet is on the page, not when it was asked for
  useEffect(() => onShown(scene), [scene, generation, onShown])
  return (
    <div className="ld-root" data-theme={theme}>
      <EmbedView
        key={generation}
        scene={scene}
        theme={theme}
        initial={settings}
        fit
      />
    </div>
  )
}

export function Problem({
  theme,
  detail,
}: {
  theme: ThemeId
  detail: ErrorDetail
}) {
  return (
    <div className="ld-root" data-theme={theme}>
      <div className="ld-error" role="alert">
        <strong>This diagram can’t be shown.</strong> {detail.message}
        {detail.errors.length > 0 && (
          <ul>
            {detail.errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {detail.errors.length > 8 && (
              <li>…and {detail.errors.length - 8} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
