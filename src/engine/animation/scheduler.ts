// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { getNodeFill } from './nodeElements'
import { payloadColorToken } from './payloadGlyphs'
import { SvgPayloadRenderer } from './SvgPayloadRenderer'
import type { PayloadRenderer, Sprite } from './types'
import { getNodeKind, getSpec } from '../registry/packRegistry'
import { useDiagramStore } from '../store/useDiagramStore'
import { useSimStore } from '../store/useSimStore'
import { hasLevel } from '../types/affordance'
import type { ArriveEffect } from '../types/animationSpec'

interface LiveSprite {
  interactionId: string
  elapsed: number
  duration: number
  behavior: string
  payload: string
  returnPayload: string | undefined
  size: number
  easing: string
  fromU: number
  toU: number
  onArrive: ArriveEffect | undefined
  amount: number | undefined
  toId: string
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

function ease(kind: string, t: number): number {
  switch (kind) {
    case 'easeIn':
      return t * t
    case 'easeOut':
      return 1 - (1 - t) * (1 - t)
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    default:
      return t
  }
}

/**
 * The single-rAF animation scheduler. Each frame it reads the stores via
 * getState() (no subscription), advances sprite clocks, samples the real React
 * Flow edge paths for positions, mutates node levels, and paints — all
 * imperatively, so a 60fps tick triggers zero React re-renders. Under reduced
 * motion it renders static indicators once and never starts the loop.
 */
export class Scheduler {
  private renderer: PayloadRenderer
  private raf = 0
  private running = false
  private last = 0
  private reduced: boolean

  private sprites: LiveSprite[] = []
  private emitters = new Map<string, number>()
  private levels = new Map<string, number>()
  private pathCache = new Map<string, SVGGeometryElement>()
  private frameLen = new Map<string, number>()
  private levelSignature = ''
  private lastResetNonce = -1
  private unsub: Array<() => void> = []

  constructor(container: HTMLElement) {
    this.renderer = new SvgPayloadRenderer()
    this.renderer.mount(container)
    this.reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  start(): void {
    if (this.running) return
    this.running = true
    if (this.reduced) {
      this.renderStatic()
      this.unsub.push(useDiagramStore.subscribe(() => this.renderStatic()))
      this.unsub.push(useSimStore.subscribe(() => this.renderStatic()))
      return
    }
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    for (const u of this.unsub) u()
    this.unsub = []
    this.renderer.destroy()
  }

  private getPath(interactionId: string): SVGGeometryElement | null {
    const cached = this.pathCache.get(interactionId)
    if (cached && cached.isConnected) return cached
    const el = document.querySelector<SVGGeometryElement>(
      `.react-flow__edge[data-id="e-${interactionId}"] .react-flow__edge-path`,
    )
    if (el) this.pathCache.set(interactionId, el)
    else this.pathCache.delete(interactionId)
    return el
  }

  private lengthOf(interactionId: string, path: SVGGeometryElement): number {
    let len = this.frameLen.get(interactionId)
    if (len === undefined) {
      len = path.getTotalLength()
      this.frameLen.set(interactionId, len)
    }
    return len
  }

  private syncLevels(): void {
    const { nodes } = useDiagramStore.getState()
    const resetNonce = useSimStore.getState().resetNonce
    const signature = nodes.map((n) => n.id).join(',')
    if (signature === this.levelSignature && resetNonce === this.lastResetNonce) {
      return
    }
    this.levelSignature = signature
    this.lastResetNonce = resetNonce
    const next = new Map<string, number>()
    for (const node of nodes) {
      const kind = getNodeKind(node.data.kindId)
      if (!kind || !hasLevel(kind.affordances)) continue
      const dataLevel =
        typeof node.data.level === 'number' ? node.data.level : undefined
      const capInitial = kind.capacity
        ? (kind.capacity.initial ?? 0) / kind.capacity.max
        : 0
      next.set(node.id, clamp01(dataLevel ?? capInitial))
    }
    this.levels = next
  }

  private applyLevel(nodeId: string, delta: number): void {
    const current = this.levels.get(nodeId)
    if (current === undefined) return
    this.levels.set(nodeId, clamp01(current + delta))
  }

  private applyFills(): void {
    for (const [id, level] of this.levels) {
      const el = getNodeFill(id)
      if (el) el.style.height = `${(level * 100).toFixed(1)}%`
    }
  }

  private spawn(
    interactionId: string,
    from: string,
    to: string,
    spriteBase: Omit<LiveSprite, 'interactionId' | 'elapsed' | 'toId'>,
    departEffect: ArriveEffect | undefined,
    departId: string,
    amount: number | undefined,
  ): void {
    if (departEffect && departEffect !== 'none' && amount) {
      this.applyLevel(departId, departEffect === 'increment' ? amount : -amount)
    }
    this.sprites.push({
      ...spriteBase,
      interactionId,
      elapsed: 0,
      toId: spriteBase.toU === 0 ? from : to,
    })
  }

  private loop = (now: number): void => {
    if (!this.running) return
    const dt = Math.min(now - this.last, 64)
    this.last = now
    this.frameLen.clear()

    const { interactions } = useDiagramStore.getState()
    const throughput = useSimStore.getState().throughput
    this.syncLevels()

    const active = Object.values(interactions).filter((i) => getSpec(i.specId))
    const activeIds = new Set(active.map((i) => i.id))

    // Emission
    for (const inter of active) {
      const spec = getSpec(inter.specId)
      const behavior = spec?.behaviors[0]
      if (!spec || !behavior) continue
      const fromU = behavior.from === 'source' ? 0 : 1
      const toU = behavior.to === 'source' ? 0 : 1
      const departId = behavior.from === 'source' ? inter.from : inter.to
      const base = {
        duration: behavior.durationMs,
        behavior: String(behavior.behavior),
        payload: String(spec.payload.sprite),
        returnPayload: behavior.returnSprite
          ? String(behavior.returnSprite)
          : undefined,
        size: spec.payload.size,
        easing: behavior.easing ?? 'linear',
        fromU,
        toU,
        onArrive: behavior.onArrive,
        amount: behavior.amount,
      }

      if (spec.emission.mode === 'continuous') {
        let acc = this.emitters.get(inter.id) ?? Math.random()
        acc += (dt / 1000) * spec.emission.rate * throughput
        while (acc >= 1) {
          acc -= 1
          this.spawn(
            inter.id,
            inter.from,
            inter.to,
            base,
            behavior.onDepart,
            departId,
            behavior.amount,
          )
        }
        this.emitters.set(inter.id, acc)
      } else if (!this.emitters.has(inter.id)) {
        const count =
          spec.emission.mode === 'burst' ? (spec.emission.burstSize ?? 3) : 1
        for (let k = 0; k < count; k++) {
          this.spawn(
            inter.id,
            inter.from,
            inter.to,
            base,
            behavior.onDepart,
            departId,
            behavior.amount,
          )
        }
        this.emitters.set(inter.id, 0)
      }
    }

    // Advance + render
    const out: Sprite[] = []
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sp = this.sprites[i]
      if (!sp || !activeIds.has(sp.interactionId)) {
        this.sprites.splice(i, 1)
        continue
      }
      const path = this.getPath(sp.interactionId)
      if (!path) {
        this.sprites.splice(i, 1)
        continue
      }
      sp.elapsed += dt * throughput
      const p = clamp01(sp.elapsed / sp.duration)

      let u: number
      let payload = sp.payload
      if (sp.behavior === 'roundTrip') {
        const leg = p < 0.5 ? p * 2 : (p - 0.5) * 2
        const e = ease(sp.easing, leg)
        u = p < 0.5 ? e : 1 - e
        if (p >= 0.5 && sp.returnPayload) payload = sp.returnPayload
      } else {
        u = sp.fromU + (sp.toU - sp.fromU) * ease(sp.easing, p)
      }

      if (p >= 1) {
        if (sp.onArrive && sp.onArrive !== 'none' && sp.amount) {
          this.applyLevel(
            sp.toId,
            sp.onArrive === 'increment' ? sp.amount : -sp.amount,
          )
        }
        this.sprites.splice(i, 1)
        continue
      }

      const len = this.lengthOf(sp.interactionId, path)
      const pt = path.getPointAtLength(u * len)
      const opacity = p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1
      out.push({
        payload,
        colorToken: payloadColorToken(payload),
        size: sp.size,
        x: pt.x,
        y: pt.y,
        opacity,
      })
    }

    this.renderer.render(out)
    this.applyFills()
    this.raf = requestAnimationFrame(this.loop)
  }

  /** Reduced-motion: no sprites; set a representative static level per node. */
  private renderStatic(): void {
    this.lastResetNonce = -1
    this.syncLevels()
    const { interactions } = useDiagramStore.getState()
    for (const inter of Object.values(interactions)) {
      const spec = getSpec(inter.specId)
      const behavior = spec?.behaviors[0]
      if (!behavior) continue
      const toId = behavior.to === 'source' ? inter.from : inter.to
      const fromId = behavior.from === 'source' ? inter.from : inter.to
      if (behavior.onArrive === 'increment' && this.levels.has(toId)) {
        this.levels.set(toId, 0.7)
      }
      if (behavior.onDepart === 'decrement' && this.levels.has(fromId)) {
        this.levels.set(fromId, 0.3)
      }
    }
    this.renderer.clear()
    this.applyFills()
  }
}
