// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import styles from './SourceLink.module.css'

/**
 * The public source repository (AGPL-3.0). Still the pre-rename slug — update
 * this once the GitHub repo is renamed (see SETUP.md checklist).
 */
export const REPO_URL = 'https://github.com/light-vp/living-diagrams'

/**
 * AGPL §13: because this is a hosted, network-accessible app, users must be able
 * to get its source. Embeds show this floating link; keep it visible.
 */
export function SourceLink() {
  return (
    <a
      className={styles.floating}
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
    >
      source ↗
    </a>
  )
}
