// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { VerbDef } from '../../engine'

/**
 * Verb defaults for the cloud pack: each verb's default payload + the spec id
 * used when the user picks it manually. The animation specs themselves land in
 * M3; until then getSpec() returns undefined and edges simply show the label.
 */
export const cloudVerbs: VerbDef[] = [
  { verb: 'upload', label: 'Upload', defaultPayload: 'file', defaultSpecId: 'cloud.upload.v1' },
  { verb: 'download', label: 'Download', defaultPayload: 'file', defaultSpecId: 'cloud.download.v1' },
  { verb: 'query', label: 'Query', defaultPayload: 'request', defaultSpecId: 'cloud.query.v1' },
  { verb: 'publish', label: 'Publish', defaultPayload: 'event', defaultSpecId: 'cloud.publish.v1' },
  { verb: 'subscribe', label: 'Subscribe', defaultPayload: 'event', defaultSpecId: 'cloud.subscribe.v1' },
  { verb: 'consume', label: 'Consume', defaultPayload: 'message', defaultSpecId: 'cloud.consume.v1' },
  { verb: 'replicate', label: 'Replicate', defaultPayload: 'blob', defaultSpecId: 'cloud.replicate.v1', defaultDirection: 'bidirectional' },
  { verb: 'stream', label: 'Stream', defaultPayload: 'packet', defaultSpecId: 'cloud.stream.v1' },
  { verb: 'cache', label: 'Cache', defaultPayload: 'request', defaultSpecId: 'cloud.cache.v1' },
  { verb: 'write', label: 'Write', defaultPayload: 'record', defaultSpecId: 'cloud.upload.v1' },
  { verb: 'read', label: 'Read', defaultPayload: 'record', defaultSpecId: 'cloud.download.v1' },
]
