// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { NodeKind } from '../../engine'

/**
 * The cloud pack's node kinds — pure data. Affordances drive the resolver:
 *   service {emit,serve}, bucket {store}, queue {route}, worker {consume},
 *   db {serve,store}, cdn {cache,serve,store}, origin {serve,store}.
 */
export const cloudKinds: NodeKind[] = [
  {
    id: 'cloud.service',
    pack: 'cloud',
    label: 'Service',
    category: 'compute',
    affordances: ['emit', 'serve'],
    icon: 'cloud.service',
    accentToken: 'var(--kind-compute)',
    providers: { aws: 'ECS / Lambda', gcp: 'Cloud Run', azure: 'App Service' },
  },
  {
    id: 'cloud.bucket',
    pack: 'cloud',
    label: 'Object Storage',
    category: 'storage',
    affordances: ['store'],
    icon: 'cloud.bucket',
    accentToken: 'var(--kind-storage)',
    capacity: { max: 100, unit: 'objects', initial: 0 },
    providers: { aws: 'S3', gcp: 'Cloud Storage', azure: 'Blob Storage' },
  },
  {
    id: 'cloud.queue',
    pack: 'cloud',
    label: 'Queue',
    category: 'integration',
    affordances: ['route'],
    icon: 'cloud.queue',
    accentToken: 'var(--kind-integration)',
    providers: { aws: 'SQS', gcp: 'Pub/Sub', azure: 'Service Bus' },
  },
  {
    id: 'cloud.worker',
    pack: 'cloud',
    label: 'Worker',
    category: 'compute',
    affordances: ['consume'],
    icon: 'cloud.worker',
    accentToken: 'var(--kind-compute)',
    providers: { aws: 'Lambda / ECS', gcp: 'Cloud Run', azure: 'Functions' },
  },
  {
    id: 'cloud.db',
    pack: 'cloud',
    label: 'Database',
    category: 'data',
    affordances: ['serve', 'store'],
    icon: 'cloud.db',
    accentToken: 'var(--kind-data)',
    capacity: { max: 100, unit: 'rows', initial: 40 },
    providers: { aws: 'RDS / DynamoDB', gcp: 'Cloud SQL', azure: 'Cosmos DB' },
  },
  {
    id: 'cloud.cdn',
    pack: 'cloud',
    label: 'CDN',
    category: 'network',
    affordances: ['cache', 'serve', 'store'],
    icon: 'cloud.cdn',
    accentToken: 'var(--kind-network)',
    capacity: { max: 100, unit: 'cached', initial: 0 },
    providers: { aws: 'CloudFront', gcp: 'Cloud CDN', azure: 'Front Door' },
  },
  {
    id: 'cloud.origin',
    pack: 'cloud',
    label: 'Origin',
    category: 'compute',
    affordances: ['serve', 'store'],
    icon: 'cloud.origin',
    accentToken: 'var(--kind-compute)',
    providers: { aws: 'EC2 / ALB', gcp: 'Compute Engine', azure: 'VM' },
  },
]
