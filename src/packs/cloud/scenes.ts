// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import type { Scene } from '../../engine'

/**
 * Curated cloud scenes. Each `sequence` step names the interactions (edge ids)
 * that animate during that step — presentation mode lights up the system layer
 * by layer.
 */

const cdn: Scene = {
  id: 'cdn',
  title: 'CDN cache warm-up',
  description: 'A cache miss falls back to origin, then subsequent hits are instant.',
  entryNodeId: 'user',
  nodes: [
    { id: 'user', kind: 'cloud.service', position: { x: 80, y: 200 }, label: 'User' },
    { id: 'cdn', kind: 'cloud.cdn', position: { x: 400, y: 200 }, label: 'CDN' },
    { id: 'origin', kind: 'cloud.origin', position: { x: 720, y: 200 }, label: 'Origin' },
  ],
  edges: [
    { id: 'req', source: 'user', target: 'cdn', verb: 'query' },
    { id: 'miss', source: 'cdn', target: 'origin', verb: 'cache' },
    { id: 'fill', source: 'origin', target: 'cdn', verb: 'upload' },
  ],
  sequence: [
    { caption: 'A user requests an asset from the CDN.', activateEdges: ['req'], holdMs: 1800 },
    { caption: 'Cache miss — the CDN fetches it from origin.', activateEdges: ['miss'], holdMs: 2000 },
    { caption: 'The origin returns the asset; the CDN caches it (watch it fill).', activateEdges: ['fill'], holdMs: 2400 },
    { caption: 'Warm cache — the CDN now serves the asset instantly.', activateEdges: ['req'], holdMs: 2000 },
  ],
}

const microservices: Scene = {
  id: 'microservices',
  title: 'Microservices request path',
  description: 'One request stores an upload, records an order, and fans out an event.',
  entryNodeId: 'api',
  nodes: [
    { id: 'api', kind: 'cloud.service', position: { x: 60, y: 220 }, label: 'API' },
    { id: 'bucket', kind: 'cloud.bucket', position: { x: 360, y: 60 }, label: 'Uploads' },
    { id: 'db', kind: 'cloud.db', position: { x: 360, y: 380 }, label: 'Orders DB' },
    { id: 'queue', kind: 'cloud.queue', position: { x: 380, y: 220 }, label: 'Events' },
    { id: 'email', kind: 'cloud.worker', position: { x: 720, y: 140 }, label: 'Email' },
    { id: 'billing', kind: 'cloud.worker', position: { x: 720, y: 300 }, label: 'Billing' },
  ],
  edges: [
    { id: 'store', source: 'api', target: 'bucket', verb: 'upload' },
    { id: 'record', source: 'api', target: 'db', verb: 'query' },
    { id: 'emit', source: 'api', target: 'queue', verb: 'publish' },
    { id: 'c-email', source: 'queue', target: 'email', verb: 'consume' },
    { id: 'c-billing', source: 'queue', target: 'billing', verb: 'consume' },
  ],
  sequence: [
    { caption: 'The API stores the uploaded file (the bucket fills).', activateEdges: ['store'], holdMs: 2200 },
    { caption: 'It records the order in the database.', activateEdges: ['record'], holdMs: 2000 },
    { caption: 'It publishes an "order placed" event to the queue.', activateEdges: ['emit'], holdMs: 1800 },
    { caption: 'Workers consume the event in parallel.', activateEdges: ['c-email', 'c-billing'], holdMs: 2400 },
  ],
}

const oauth2: Scene = {
  id: 'oauth2',
  title: 'OAuth2 authorization code flow',
  description: 'Follow a login from the browser to a token-authorised API call.',
  entryNodeId: 'browser',
  nodes: [
    { id: 'browser', kind: 'cloud.service', position: { x: 40, y: 240 }, label: 'Browser' },
    { id: 'app', kind: 'cloud.service', position: { x: 300, y: 240 }, label: 'Web App' },
    { id: 'authz', kind: 'cloud.service', position: { x: 560, y: 110 }, label: 'Auth Server' },
    { id: 'userdb', kind: 'cloud.db', position: { x: 820, y: 110 }, label: 'User DB' },
    { id: 'api', kind: 'cloud.service', position: { x: 560, y: 380 }, label: 'Resource API' },
  ],
  edges: [
    { id: 'login', source: 'browser', target: 'app', verb: 'query' },
    { id: 'redirect', source: 'app', target: 'authz', verb: 'query' },
    { id: 'verify', source: 'authz', target: 'userdb', verb: 'query' },
    { id: 'code', source: 'authz', target: 'app', verb: 'download' },
    { id: 'call', source: 'app', target: 'api', verb: 'query' },
  ],
  sequence: [
    { caption: '1. The user clicks "Log in".', activateEdges: ['login'], holdMs: 1800 },
    { caption: '2. The app redirects to the Auth Server.', activateEdges: ['redirect'], holdMs: 1800 },
    { caption: '3. The Auth Server verifies the user.', activateEdges: ['verify'], holdMs: 2000 },
    { caption: '4. An authorization code is returned to the app.', activateEdges: ['code'], holdMs: 1800 },
    { caption: '5. The app calls the Resource API with the token.', activateEdges: ['call'], holdMs: 2000 },
  ],
}

export const cloudScenes: Scene[] = [cdn, microservices, oauth2]
