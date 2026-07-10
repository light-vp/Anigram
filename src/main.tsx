// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@xyflow/react/dist/style.css'
import './styles/reset.css'
import './styles/tokens.css'
import './styles/global.css'
import './engine/styles/xyflow-overrides.css'

import {
  exportDiagramJson,
  importDiagramJson,
  loadFromStorage,
  startAutosave,
  useDiagramStore,
  useSimStore,
} from './engine'
import { initAnalytics } from './app/analytics'
import { App } from './app/App'
import { registerAllPacks } from './app/packs'
import { seedDemo } from './app/seedDemo'

// Register packs. The normal app and the playable `?embed=app` iframe load a
// saved diagram (or seed the demo) and autosave; presentation embeds load the
// requested scene in the App and stay stateless.
const embed = new URLSearchParams(window.location.search).get('embed')
registerAllPacks()
initAnalytics()
if (!embed || embed === 'app') {
  if (!loadFromStorage()) seedDemo()
  startAutosave()
}

// Dev-only handle for driving/inspecting the store from the console/tests.
if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).__ld = {
    useDiagramStore,
    useSimStore,
    exportDiagramJson,
    importDiagramJson,
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
