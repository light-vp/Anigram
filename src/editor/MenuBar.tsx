// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

import styles from './MenuBar.module.css'

/*
 * The editor's menu bar, the way a desktop app has one: click a menu to open
 * it, and while one is open, pointing at another opens that instead. The
 * arrow keys move through the items and across the menus, escape closes.
 */

export type MenuItem =
  | {
      kind: 'action'
      label: string
      onSelect: () => void
      shortcut?: string
      disabled?: boolean
    }
  | { kind: 'radio'; label: string; checked: boolean; onSelect: () => void }
  | { kind: 'link'; label: string; href: string; external?: boolean }
  | { kind: 'separator' }
  | { kind: 'heading'; label: string }

export interface Menu {
  id: string
  label: string
  items: MenuItem[]
}

const items = (el: HTMLElement | null) =>
  Array.from(
    el?.querySelectorAll<HTMLElement>(
      '[role^="menuitem"]:not([aria-disabled="true"])',
    ) ?? [],
  )

export function MenuBar({
  menus,
  start,
  middle,
}: {
  menus: Menu[]
  /** before the menus: the brand */
  start?: ReactNode
  /** centred in the bar: the sheet's title */
  middle?: ReactNode
}) {
  const [open, setOpen] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  // where focus goes once a menu opens: its first item, its last, or stay on the trigger
  const focusOnOpen = useRef<'first' | 'last' | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (!open || !focusOnOpen.current) return
    const list = items(document.getElementById(`menu-${open}`))
    ;(focusOnOpen.current === 'first' ? list[0] : list.at(-1))?.focus()
    focusOnOpen.current = null
  }, [open])

  const across = (from: string, step: number, keepOpen: boolean) => {
    const i = menus.findIndex((m) => m.id === from)
    const next = menus[(i + step + menus.length) % menus.length]!
    triggers.current.get(next.id)?.focus()
    if (keepOpen) {
      focusOnOpen.current = 'first'
      setOpen(next.id)
    }
  }

  const close = (refocus: boolean) => {
    if (refocus && open) triggers.current.get(open)?.focus()
    setOpen(null)
  }

  const onMenuKey = (e: ReactKeyboardEvent, menu: Menu) => {
    const list = items(e.currentTarget as HTMLElement)
    const at = list.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => list[(i + list.length) % list.length]?.focus()
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(list.length - 1)
    else if (e.key === 'ArrowRight') across(menu.id, 1, true)
    else if (e.key === 'ArrowLeft') across(menu.id, -1, true)
    else if (e.key === 'Escape') close(true)
    else if (e.key === 'Tab') return setOpen(null)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className={styles.bar} ref={bar}>
      <div className={styles.start}>
        {start}
        <div className={styles.menus} role="menubar" aria-label="Editor">
          {menus.map((m) => (
            <div key={m.id} className={styles.menuSlot} role="none">
              <button
                type="button"
                ref={(el) => {
                  if (el) triggers.current.set(m.id, el)
                }}
                className={styles.trigger}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open === m.id}
                aria-controls={`menu-${m.id}`}
                onClick={() => setOpen(open === m.id ? null : m.id)}
                onPointerEnter={() => open && open !== m.id && setOpen(m.id)}
                onKeyDown={(e) => {
                  if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
                    focusOnOpen.current = 'first'
                    setOpen(m.id)
                  } else if (e.key === 'ArrowUp') {
                    focusOnOpen.current = 'last'
                    setOpen(m.id)
                  } else if (e.key === 'ArrowRight') across(m.id, 1, !!open)
                  else if (e.key === 'ArrowLeft') across(m.id, -1, !!open)
                  else if (e.key === 'Escape') close(true)
                  else return
                  e.preventDefault()
                }}
              >
                {m.label}
              </button>
              {open === m.id && (
                <div
                  id={`menu-${m.id}`}
                  className={styles.menu}
                  role="menu"
                  aria-label={m.label}
                  onKeyDown={(e) => onMenuKey(e, m)}
                >
                  {m.items.map((it, i) => (
                    <Item key={i} item={it} done={() => setOpen(null)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.middle}>{middle}</div>
      <div className={styles.end} />
    </div>
  )
}

function Item({ item, done }: { item: MenuItem; done: () => void }) {
  if (item.kind === 'separator')
    return <div className={styles.separator} role="separator" />
  if (item.kind === 'heading')
    return (
      <div className={styles.heading} role="presentation">
        {item.label}
      </div>
    )
  if (item.kind === 'link')
    return (
      <a
        className={styles.item}
        role="menuitem"
        tabIndex={-1}
        href={item.href}
        target={item.external ? '_blank' : undefined}
        rel={item.external ? 'noreferrer' : undefined}
        onClick={done}
      >
        <span className={styles.mark} />
        <span className={styles.label}>{item.label}</span>
        {item.external && (
          <svg className={styles.out} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 H9.5 V8 M9.5 2.5 L2.5 9.5" />
          </svg>
        )}
      </a>
    )
  const radio = item.kind === 'radio'
  const disabled = item.kind === 'action' && !!item.disabled
  return (
    <button
      type="button"
      className={styles.item}
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? item.checked : undefined}
      aria-keyshortcuts={
        item.kind === 'action' ? keyshortcuts(item.shortcut) : undefined
      }
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onClick={() => {
        if (disabled) return
        done()
        item.onSelect()
      }}
    >
      <span className={styles.mark}>
        {radio && item.checked && (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.2 L5 8.6 L9.5 3.4" />
          </svg>
        )}
      </span>
      <span className={styles.label}>{item.label}</span>
      {item.kind === 'action' && item.shortcut && (
        <kbd className={styles.shortcut} aria-hidden="true">
          {item.shortcut}
        </kbd>
      )}
    </button>
  )
}

/** a shortcut as menus show it (⇧⌘Z, Ctrl+O) as aria-keyshortcuts spells it */
function keyshortcuts(shown: string | undefined) {
  if (!shown) return undefined
  const keys = shown
    .replace('⌘', 'Meta+')
    .replace('Ctrl+', 'Control+')
    .replace('⇧', 'Shift+')
    .replace('⌫', 'Backspace')
  return keys.replace(/\+$/, '')
}
