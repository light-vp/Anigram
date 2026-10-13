// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { REPO_URL, SUPPORT_URL } from './links.ts'
import styles from './SiteHeader.module.css'

export type Page = 'editor' | 'examples' | 'docs'

/*
 * The one header across Anigram: the editor is home, the examples run the
 * built-in sheets, the docs say how it all works. Links are relative, so the
 * same build works at anigram.vaibhav.co.uk and under /anigram-app/.
 */
const PAGES: Array<{ id: Page | 'mcp'; label: string; href: string }> = [
  { id: 'editor', label: 'Editor', href: './' },
  { id: 'examples', label: 'Examples', href: './?examples' },
  { id: 'docs', label: 'Docs', href: './?docs' },
  { id: 'mcp', label: 'MCP', href: './?docs#mcp' },
]

export function SiteHeader({ page }: { page: Page }) {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="./" aria-label="Anigram home">
        <Logo />
        <strong>Anigram</strong>
      </a>
      <nav className={styles.nav} aria-label="Anigram">
        {PAGES.map((p) => (
          <a
            key={p.id}
            href={p.href}
            className={p.id === page ? styles.on : styles.link}
            aria-current={p.id === page ? 'page' : undefined}
          >
            {p.label}
          </a>
        ))}
      </nav>
      <span className={styles.spacer} />
      <a
        className={styles.out}
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
      >
        GitHub ↗
      </a>
      <a
        className={styles.out}
        href={SUPPORT_URL}
        target="_blank"
        rel="noreferrer"
      >
        Support ↗
      </a>
    </header>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      className={styles.logo}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    >
      <rect x={2.5} y={2.5} width={19} height={19} rx={6} />
      <path d="M7 12 H17" />
      <circle cx={10} cy={12} r={1.4} fill="currentColor" />
    </svg>
  )
}
