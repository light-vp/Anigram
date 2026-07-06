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

export const cloudSpecs: AnimationSpec[] = [upload, download, query]
