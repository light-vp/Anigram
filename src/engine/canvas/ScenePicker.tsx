// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getScene, getScenes } from '../registry/packRegistry'
import { loadScene } from '../scenes'
import { useSimStore } from '../store/useSimStore'
import styles from './ScenePicker.module.css'

/**
 * Loads a curated scene and starts presentation mode. Built from the registry,
 * so any pack's scenes appear.
 */
export function ScenePicker() {
  const scenes = getScenes()
  const startPresentation = useSimStore((s) => s.startPresentation)

  if (scenes.length === 0) return null

  const onPick = (id: string) => {
    const scene = getScene(id)
    if (!scene) return
    loadScene(scene)
    startPresentation(scene.id, scene.sequence)
  }

  return (
    <div className={styles.picker}>
      <span className={styles.label}>scene</span>
      <select
        className={styles.select}
        value=""
        onChange={(e) => onPick(e.target.value)}
      >
        <option value="" disabled>
          load a scene…
        </option>
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
    </div>
  )
}
