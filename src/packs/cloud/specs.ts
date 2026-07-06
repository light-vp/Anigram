// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { AnimationSpec } from '../../engine'

/**
 * The three flagship semantic animations. Each is just data the engine
 * interprets — and they read as visibly different motion:
 *   upload   → files travel to the bucket; the bucket FILLS.
 *   download → files DRAIN out of the source and travel away.
 *   query    → a request ROUND-TRIPS to the DB and a response returns.
 */

const upload: AnimationSpec = {
  id: 'cloud.upload.v1',
  version: 1,
  payload: { sprite: 'file', size: 15, colorToken: 'var(--payload-file)' },
  emission: { mode: 'continuous', rate: 2, jitter: 0.2 },
  behaviors: [
    {
      behavior: 'accumulate',
      from: 'source',
      to: 'target',
      durationMs: 1200,
      easing: 'easeInOut',
      onArrive: 'increment',
      amount: 0.09,
    },
  ],
  reactions: [
    { node: 'source', effect: 'emit', on: 'spawn' },
    { node: 'target', effect: 'fill', on: 'levelChange' },
  ],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'fill-bar' },
  exposedParams: [
    'payload.sprite',
    'payload.colorToken',
    'emission.rate',
    'emission.mode',
    'behaviors.0.amount',
    'behaviors.0.onArrive',
  ],
}

const download: AnimationSpec = {
  id: 'cloud.download.v1',
  version: 1,
  payload: { sprite: 'file', size: 15, colorToken: 'var(--payload-file)' },
  emission: { mode: 'continuous', rate: 2, jitter: 0.2 },
  behaviors: [
    {
      behavior: 'drain',
      from: 'source',
      to: 'target',
      durationMs: 1200,
      easing: 'easeInOut',
      onDepart: 'decrement',
      amount: 0.09,
    },
  ],
  reactions: [
    { node: 'source', effect: 'drain', on: 'levelChange' },
    { node: 'target', effect: 'absorb', on: 'arrive' },
  ],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'arrow' },
  exposedParams: [
    'payload.sprite',
    'payload.colorToken',
    'emission.rate',
    'emission.mode',
    'behaviors.0.amount',
  ],
}

const query: AnimationSpec = {
  id: 'cloud.query.v1',
  version: 1,
  payload: { sprite: 'request', size: 13, colorToken: 'var(--payload-request)' },
  emission: { mode: 'continuous', rate: 1.1, jitter: 0.1 },
  behaviors: [
    {
      behavior: 'roundTrip',
      from: 'source',
      to: 'target',
      durationMs: 1700,
      easing: 'easeInOut',
      returnSprite: 'response',
    },
  ],
  reactions: [
    { node: 'target', effect: 'flash', on: 'arrive' },
    { node: 'source', effect: 'absorb', on: 'arrive' },
  ],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'double-arrow' },
  exposedParams: [
    'payload.sprite',
    'payload.colorToken',
    'emission.rate',
    'behaviors.0.durationMs',
  ],
}

const publish: AnimationSpec = {
  id: 'cloud.publish.v1',
  version: 1,
  payload: { sprite: 'event', size: 13, colorToken: 'var(--payload-event)' },
  emission: { mode: 'continuous', rate: 2.6, jitter: 0.3 },
  behaviors: [
    { behavior: 'travel', from: 'source', to: 'target', durationMs: 1000, easing: 'easeOut' },
  ],
  reactions: [
    { node: 'source', effect: 'emit', on: 'spawn' },
    { node: 'target', effect: 'absorb', on: 'arrive' },
  ],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'arrow' },
  exposedParams: ['payload.colorToken', 'emission.rate'],
}

const consume: AnimationSpec = {
  id: 'cloud.consume.v1',
  version: 1,
  payload: { sprite: 'message', size: 13, colorToken: 'var(--payload-message)' },
  emission: { mode: 'continuous', rate: 1.8, jitter: 0.2 },
  behaviors: [
    { behavior: 'travel', from: 'source', to: 'target', durationMs: 1100, easing: 'easeInOut' },
  ],
  reactions: [{ node: 'target', effect: 'flash', on: 'arrive' }],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'arrow' },
  exposedParams: ['payload.colorToken', 'emission.rate'],
}

const cache: AnimationSpec = {
  id: 'cloud.cache.v1',
  version: 1,
  payload: { sprite: 'request', size: 12, colorToken: 'var(--payload-request)' },
  emission: { mode: 'continuous', rate: 1.2, jitter: 0.1 },
  behaviors: [
    {
      behavior: 'roundTrip',
      from: 'source',
      to: 'target',
      durationMs: 1500,
      easing: 'easeInOut',
      returnSprite: 'file',
    },
  ],
  reactions: [{ node: 'target', effect: 'flash', on: 'arrive' }],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'double-arrow' },
  exposedParams: ['payload.colorToken', 'behaviors.0.durationMs'],
}

const stream: AnimationSpec = {
  id: 'cloud.stream.v1',
  version: 1,
  payload: { sprite: 'packet', size: 10, colorToken: 'var(--payload-packet)' },
  emission: { mode: 'continuous', rate: 4, jitter: 0.4 },
  behaviors: [
    { behavior: 'travel', from: 'source', to: 'target', durationMs: 900, easing: 'linear' },
  ],
  reactions: [],
  timing: { speedCoupling: 'global', baseSpeed: 1, loop: true },
  reducedMotion: { mode: 'static-indicator', glyph: 'arrow' },
  exposedParams: ['emission.rate', 'behaviors.0.durationMs'],
}

export const cloudSpecs: AnimationSpec[] = [
  upload,
  download,
  query,
  publish,
  consume,
  cache,
  stream,
]
