// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { ResolverRule } from '../../engine'

/**
 * Resolver rules for the cloud pack, as data. Affordance-pair rules are the
 * general defaults; kind-pair rules sharpen specific connections (and win, being
 * more specific). Order matters only to break score ties.
 */
export const cloudResolverRules: ResolverRule[] = [
  // ---- kind-pair (specific) ----
  { match: 'kindPair', source: 'cloud.service', target: 'cloud.bucket', verb: 'upload', payload: 'file', specId: 'cloud.upload.v1', label: 'Upload' },
  { match: 'kindPair', source: 'cloud.bucket', target: 'cloud.service', verb: 'download', payload: 'file', specId: 'cloud.download.v1', label: 'Download' },
  { match: 'kindPair', source: 'cloud.service', target: 'cloud.db', verb: 'query', payload: 'request', specId: 'cloud.query.v1', label: 'Query' },
  { match: 'kindPair', source: 'cloud.service', target: 'cloud.queue', verb: 'publish', payload: 'event', specId: 'cloud.publish.v1', label: 'Publish' },
  { match: 'kindPair', source: 'cloud.queue', target: 'cloud.worker', verb: 'consume', payload: 'message', specId: 'cloud.consume.v1', label: 'Consume' },
  { match: 'kindPair', source: 'cloud.db', target: 'cloud.db', verb: 'replicate', payload: 'blob', direction: 'bidirectional', specId: 'cloud.replicate.v1', label: 'Replicate' },
  { match: 'kindPair', source: 'cloud.cdn', target: 'cloud.origin', verb: 'cache', payload: 'request', specId: 'cloud.cache.v1', label: 'Cache miss' },
  { match: 'kindPair', source: 'cloud.origin', target: 'cloud.cdn', verb: 'download', payload: 'file', specId: 'cloud.download.v1', label: 'Fill cache' },

  // ---- affordance-pair (general fallback) ----
  { match: 'affordancePair', source: 'emit', target: 'store', verb: 'upload', payload: 'file', specId: 'cloud.upload.v1', label: 'Upload' },
  { match: 'affordancePair', source: 'store', target: 'serve', verb: 'download', payload: 'file', specId: 'cloud.download.v1', label: 'Download' },
  { match: 'affordancePair', source: 'emit', target: 'serve', verb: 'query', payload: 'request', specId: 'cloud.query.v1', label: 'Query' },
  { match: 'affordancePair', source: 'emit', target: 'route', verb: 'publish', payload: 'event', specId: 'cloud.publish.v1', label: 'Publish' },
  { match: 'affordancePair', source: 'route', target: 'consume', verb: 'consume', payload: 'message', specId: 'cloud.consume.v1', label: 'Consume' },
  { match: 'affordancePair', source: 'store', target: 'store', verb: 'replicate', payload: 'blob', direction: 'bidirectional', specId: 'cloud.replicate.v1', label: 'Replicate' },
  { match: 'affordancePair', source: 'cache', target: 'serve', verb: 'cache', payload: 'request', specId: 'cloud.cache.v1', label: 'Cache' },
  { match: 'affordancePair', source: 'emit', target: 'consume', verb: 'stream', payload: 'packet', specId: 'cloud.stream.v1', label: 'Stream' },
]
