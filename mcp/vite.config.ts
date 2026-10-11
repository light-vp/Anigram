// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import { PNG_ASSETS } from './png.ts'

const from = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** the PNG renderer's wasm and fonts, beside the built server */
const pngAssets = (): Plugin => ({
  name: 'anigram-png-assets',
  writeBundle() {
    copyFileSync(
      from('../node_modules/@resvg/resvg-wasm/index_bg.wasm'),
      from(`dist/${PNG_ASSETS.wasm}`),
    )
    for (const f of [...PNG_ASSETS.fonts, 'OFL.txt'])
      copyFileSync(from(`fonts/${f}`), from(`dist/${f}`))
  },
})

// The MCP server as one self-contained node script: the simulation, the
// sheet renderer, React and the MCP SDK all bundled in, so `npx` (or a plain
// `node anigram-mcp.mjs`) needs nothing installed beside it. The only other
// files are the PNG renderer's wasm and fonts, copied into the same folder.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), pngAssets()],
  publicDir: false,
  // production React: no dev warnings on stderr, a third of the size
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'mcp/server.ts',
    outDir: 'mcp/dist',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'anigram-mcp.mjs',
        banner: '#!/usr/bin/env node',
        codeSplitting: false,
      },
    },
  },
})
