// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

import type { Params } from '../app/params.ts'
import type { Scene } from '../sim/types.ts'
import type { ThemeId } from '../view/palette.ts'
import {
  SOURCE_ATTRIBUTES,
  VIEW_ATTRIBUTES,
  loadScene,
  readSettings,
  readSource,
  readTheme,
} from './source.ts'
import type { Loaded } from './source.ts'
import { Problem, Shown } from './views.tsx'
import type { ErrorDetail, LoadDetail } from './views.tsx'

/*
 * <living-diagram>: a running sheet on any page, without an iframe. It is the
 * ?embed=1 view mounted in a shadow root, so the page's CSS can't reach the
 * sheet and the sheet's can't reach the page. It loads no analytics.
 */

/** the stylesheet, put in by the build (see vite.config.ts) */
declare const __LIVING_DIAGRAM_CSS__: string

const DARK = '(prefers-color-scheme: dark)'

export class LivingDiagram extends HTMLElement {
  static observedAttributes = [...SOURCE_ATTRIBUTES, ...VIEW_ATTRIBUTES]

  private root: Root | null = null
  private mount: HTMLDivElement
  private loaded: Loaded | null = null
  /** bumped for every load, so a slow fetch can't land over a newer one */
  private generation = 0
  private settings: Params | null = null
  private dark: MediaQueryList | null = null
  private watcher: MutationObserver | null = null
  private announced = -1

  constructor() {
    super()
    const shadow = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = __LIVING_DIAGRAM_CSS__
    this.mount = document.createElement('div')
    this.mount.className = 'ld-mount'
    shadow.append(style, this.mount)
  }

  connectedCallback() {
    this.root = createRoot(this.mount)
    this.dark = window.matchMedia(DARK)
    this.dark.addEventListener('change', this.onScheme)
    // an inline scene may be parsed after the element, or edited later
    this.watcher = new MutationObserver(() => {
      const kind = readSource(this).kind
      if (kind === 'inline' || kind === 'none' || kind === 'scene')
        void this.load()
    })
    this.watcher.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    void this.load()
  }

  disconnectedCallback() {
    this.generation++
    this.watcher?.disconnect()
    this.watcher = null
    this.dark?.removeEventListener('change', this.onScheme)
    this.dark = null
    // unmounting stops the simulation's animation loop
    this.root?.unmount()
    this.root = null
    this.loaded = null
    this.settings = null
  }

  attributeChangedCallback(
    name: string,
    old: string | null,
    now: string | null,
  ) {
    if (!this.root || old === now) return
    if ((SOURCE_ATTRIBUTES as readonly string[]).includes(name))
      void this.load()
    else {
      this.settings = null
      this.render()
    }
  }

  private onScheme = () => {
    if (readTheme(this) === 'auto') {
      this.settings = null
      this.render()
    }
  }

  private theme(): ThemeId {
    const t = readTheme(this)
    if (t !== 'auto') return t
    return this.dark?.matches ? 'dark' : 'light'
  }

  private async load() {
    const generation = ++this.generation
    const loaded = await loadScene(readSource(this))
    if (generation !== this.generation || !this.root) return
    this.loaded = loaded
    this.render()
    if (!loaded.ok)
      this.dispatchEvent(
        new CustomEvent<ErrorDetail>('error', {
          detail: { message: loaded.message, errors: loaded.errors },
        }),
      )
  }

  private onShown = (scene: Scene) => {
    // StrictMode runs effects twice in development; say it once per load
    if (this.announced === this.generation) return
    this.announced = this.generation
    this.dispatchEvent(
      new CustomEvent<LoadDetail>('load', {
        detail: { id: scene.id, title: scene.title },
      }),
    )
  }

  private render() {
    const loaded = this.loaded
    if (!this.root || !loaded) return
    const theme = this.theme()
    // a new object only when an attribute changed, so the view applies just that
    this.settings ??= readSettings(this, theme)
    this.root.render(
      <StrictMode>
        {loaded.ok ? (
          <Shown
            scene={loaded.scene}
            theme={theme}
            settings={this.settings}
            generation={this.generation}
            onShown={this.onShown}
          />
        ) : (
          <Problem theme={theme} detail={loaded} />
        )}
      </StrictMode>,
    )
  }
}

export function define(name = 'living-diagram') {
  if (!customElements.get(name)) customElements.define(name, LivingDiagram)
}
