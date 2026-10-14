// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { build, defineConfig } from 'vite'
import type { Plugin, ResolvedConfig } from 'vite'

const ELEMENT = 'living-diagram'
/** where the element's stylesheet goes, in src/element/LivingDiagram.tsx */
const CSS_SLOT = '__LIVING_DIAGRAM_CSS__'

/**
 * The element's CSS (its CSS modules and the design tokens) folded into its
 * module as one string, for its shadow root: no second request, nothing to
 * resolve against a base path. `:root` becomes `:host`, so the tokens are
 * set on the element instead of a document the shadow root can't see.
 */
function inlineCss(): Plugin {
  return {
    name: 'living-diagram:inline-css',
    enforce: 'post',
    generateBundle(_, bundle) {
      const css: string[] = []
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== 'asset' || !name.endsWith('.css')) continue
        css.push(
          typeof file.source === 'string'
            ? file.source
            : new TextDecoder().decode(file.source),
        )
        delete bundle[name]
      }
      const text = JSON.stringify(css.join('\n').replace(/:root\b/g, ':host'))
      let slots = 0
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue
        file.code = file.code.replaceAll(CSS_SLOT, () => {
          slots++
          return text
        })
      }
      if (slots !== 1)
        this.error(`expected one ${CSS_SLOT} in the element, found ${slots}`)
    },
  }
}

/**
 * After the app, build <living-diagram> into the same outDir as one
 * self-contained ES module, React included. It runs inside the app's build so
 * that `npm run build -- --base=./` (npm appends the flag to the last command)
 * still reaches the app. The element links to nothing, so base doesn't touch it.
 */
function livingDiagram(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'living-diagram:build',
    apply: 'build',
    configResolved(c) {
      config = c
    },
    async closeBundle() {
      await build({
        configFile: false,
        root: config.root,
        mode: config.mode,
        logLevel: config.logLevel,
        publicDir: false,
        plugins: [react(), inlineCss()],
        build: {
          outDir: config.build.outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          modulePreload: false,
          cssCodeSplit: false,
          sourcemap: false,
          reportCompressedSize: true,
          rolldownOptions: {
            input: {
              [ELEMENT]: fileURLToPath(
                new URL('./src/element/main.ts', import.meta.url),
              ),
            },
            output: {
              format: 'es',
              entryFileNames: `${ELEMENT}.js`,
              codeSplitting: false,
            },
          },
        },
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), livingDiagram()],
})
