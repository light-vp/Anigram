// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import styles from './SourceLink.module.css'

/** The public source repository (MIT). */
export const REPO_URL = 'https://github.com/light-vp/Anigram'

/**
 * Anigram is open source; every embed carries a way back to the code so
 * anyone who likes a drawing can fork it and make their own.
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
