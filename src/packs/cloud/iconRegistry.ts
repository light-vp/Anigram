// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { IconDef } from '../../engine'
import {
  BucketIcon,
  CdnIcon,
  DatabaseIcon,
  OriginIcon,
  QueueIcon,
  ServiceIcon,
  WorkerIcon,
} from './icons'

/** Maps icon ids (referenced by NodeKind.icon) to their glyph components. */
export const cloudIcons: IconDef[] = [
  { id: 'cloud.service', Component: ServiceIcon },
  { id: 'cloud.bucket', Component: BucketIcon },
  { id: 'cloud.queue', Component: QueueIcon },
  { id: 'cloud.worker', Component: WorkerIcon },
  { id: 'cloud.db', Component: DatabaseIcon },
  { id: 'cloud.cdn', Component: CdnIcon },
  { id: 'cloud.origin', Component: OriginIcon },
]
