// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { analyticsConfig } from './analyticsConfig'

type Props = Record<string, unknown>

let posthog: { capture: (event: string, props?: Props) => void } | null = null
const queue: Array<[string, Props]> = []
const embed = new URLSearchParams(window.location.search).get('embed')

/** record a usage event; a no-op unless PostHog is configured */
export function capture(event: string, props?: Props): void {
  if (!analyticsConfig.posthogKey) return
  const payload: Props = { embed: embed ?? 'none', ...props }
  if (posthog) posthog.capture(event, payload)
  else queue.push([event, payload])
}

/**
 * PostHog + Sentry, dynamically imported after idle so neither library enters
 * the critical bundle. Events fired before the import resolves are queued.
 * With both config values empty this is a complete no-op.
 */
export function initAnalytics(): void {
  if (!analyticsConfig.posthogKey && !analyticsConfig.sentryDsn) return

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
