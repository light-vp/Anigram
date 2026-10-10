// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The MCP server as one self-contained node script: the simulation, the
// sheet renderer, React and the MCP SDK all bundled in, so `npx` (or a plain
// `node anigram-mcp.mjs`) needs nothing installed beside it.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
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
