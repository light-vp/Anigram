// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Original, brand-neutral line glyphs for the cloud pack. These are our own
 * artwork (no vendored AWS/GCP/Azure icon sets — see NOTICE). Each renders with
 * `currentColor` so the node's accent token flows through via `color:`.
 */

import type { ReactNode } from 'react'
import type { IconProps } from '../../engine'

function Glyph({
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Service / function — a hexagon with a live core. */
export function ServiceIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3 19.8 7.5 19.8 16.5 12 21 4.2 16.5 4.2 7.5Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Glyph>
  )
}

/** Object storage — a bucket. */
export function BucketIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <ellipse cx="12" cy="6" rx="8" ry="2.5" />
      <path d="M4 6 6.5 19 Q12 21 17.5 19 L20 6" />
    </Glyph>
  )
}

/** Queue — stacked messages. */
export function QueueIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4.5" y="5" width="15" height="3.4" rx="1.5" />
      <rect x="4.5" y="10.3" width="15" height="3.4" rx="1.5" />
      <rect x="4.5" y="15.6" width="15" height="3.4" rx="1.5" />
    </Glyph>
  )
}

/** Worker — a gear/cog. */
export function WorkerIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="5.6" />
      <circle cx="12" cy="12" r="2.3" />
      <path d="M12 3.2 12 5.8M12 18.2 12 20.8M3.2 12 5.8 12M18.2 12 20.8 12M5.8 5.8 7.6 7.6M16.4 16.4 18.2 18.2M18.2 5.8 16.4 7.6M7.6 16.4 5.8 18.2" />
    </Glyph>
  )
}

/** Database — a cylinder. */
export function DatabaseIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6 L5 18 Q12 20.6 19 18 L19 6" />
      <path d="M5 12 Q12 14.6 19 12" />
    </Glyph>
  )
}

/** CDN — a globe / edge network. */
export function CdnIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="8" ry="3.1" />
      <ellipse cx="12" cy="12" rx="3.1" ry="8" />
    </Glyph>
  )
}

/** Origin — a server tower. */
export function OriginIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M9 8.5 15 8.5M9 12.5 15 12.5" />
      <circle cx="9" cy="16.6" r="0.9" />
    </Glyph>
  )
}
