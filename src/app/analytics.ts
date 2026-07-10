// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { useDiagramStore, useSimStore } from '../engine'
import { analyticsConfig } from './analyticsConfig'

type Props = Record<string, unknown>

let posthog: { capture: (event: string, props?: Props) => void } | null = null
const queue: Array<[string, Props]> = []
const embed = new URLSearchParams(window.location.search).get('embed')

function capture(event: string, props?: Props): void {
  const payload: Props = { embed: embed ?? 'none', ...props }
  if (posthog) posthog.capture(event, payload)
  else queue.push([event, payload])
}

/**
 * Usage events come from observing the engine stores here in the app layer —
 * the engine itself emits nothing (boundary: engine never imports app code).
 */
function wireStoreEvents(): void {
  useDiagramStore.subscribe((state, prev) => {
    if (state.nodes.length > prev.nodes.length) {
      capture('node_added', {
        kindId: state.nodes[state.nodes.length - 1]?.data.kindId,
      })
    }
    if (state.edges.length > prev.edges.length) {
      const edge = state.edges[state.edges.length - 1]
      const interactionId = edge?.data?.interactionId
      capture('edge_connected', {
        verb: interactionId
          ? state.interactions[interactionId]?.verb
          : undefined,
      })
    }
  })
  useSimStore.subscribe((state, prev) => {
    const sceneId = state.presentation?.sceneId
    if (sceneId && sceneId !== prev.presentation?.sceneId) {
      capture('scene_loaded', { sceneId })
    }
  })
}

/**
 * PostHog + Sentry, dynamically imported after idle so neither library enters
 * the critical bundle. Events fired before the import resolves are queued.
 * With both config values empty this is a complete no-op.
 */
export function initAnalytics(): void {
  if (!analyticsConfig.posthogKey && !analyticsConfig.sentryDsn) return
  if (analyticsConfig.posthogKey) wireStoreEvents()

  const start = () => {
    if (analyticsConfig.posthogKey) {
      void import('posthog-js').then(({ default: ph }) => {
        ph.init(analyticsConfig.posthogKey, {
          api_host: analyticsConfig.posthogHost,
          capture_pageview: true,
          autocapture: false,
        })
        posthog = ph
        for (const [event, props] of queue.splice(0)) ph.capture(event, props)
      })
    }
    if (analyticsConfig.sentryDsn) {
      void import('@sentry/react').then((Sentry) => {
        Sentry.init({ dsn: analyticsConfig.sentryDsn })
      })
    }
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(start, { timeout: 4000 })
  } else {
    setTimeout(start, 2000)
  }
}
