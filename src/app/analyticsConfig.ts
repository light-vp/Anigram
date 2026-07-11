// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

export interface AnalyticsConfig {
  /** PostHog project API key — publishable; empty string disables PostHog */
  posthogKey: string
  posthogHost: string
  /** Sentry DSN — publishable; empty string disables Sentry */
  sentryDsn: string
}

/**
 * Publishable analytics identifiers (see SETUP.md for where to create them).
 * Empty string = that integration is a complete no-op: no dynamic import, no
 * network requests. These are public values by design on a static host.
 */
export const analyticsConfig: AnalyticsConfig = {
  posthogKey: '',
  posthogHost: 'https://eu.i.posthog.com',
  sentryDsn: '',
}
