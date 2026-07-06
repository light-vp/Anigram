// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import styles from './SourceLink.module.css'

/** The public source repository (AGPL-3.0). */
export const REPO_URL = 'https://github.com/light-vp/living-diagrams'

/**
 * AGPL §13: because this is a hosted, network-accessible app, users must be able
 * to get its source. This link satisfies that; keep it visible.
 */
export function SourceLink({ floating = false }: { floating?: boolean }) {
  return (
    <a
      className={floating ? styles.floating : styles.inline}
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
    >
      source ↗
    </a>
  )
}
