// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { REPO_URL } from '../site/links.ts'
import styles from './SourceLink.module.css'

export { REPO_URL }

/**
 * Anigram is open source; every embed carries a way back to the code so
 * anyone who likes a drawing can fork it and make their own. In an embed it
 * sits in the play bar, clear of the sheet's clock; on a wall screen it
 * floats in the corner.
 */
export function SourceLink({ inline = false }: { inline?: boolean }) {
  return (
    <a
      className={inline ? styles.inline : styles.floating}
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
    >
      source ↗
    </a>
  )
}
