// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The sheet as a PNG, so an assistant can look at what it drew. resvg runs
 * as wasm (no browser, no native build), with Inter bundled because a wasm
 * renderer has no system fonts to fall back on. The wasm and the fonts are
 * copied next to the built server (see vite.config.ts) and loaded on the
 * first PNG, so the other tools never pay for them.
 */

import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from 'node:worker_threads'

import { initWasm, Resvg } from '@resvg/resvg-wasm'

/** the files the built server reads from its own folder */
export const PNG_ASSETS = {
  wasm: 'resvg.wasm',
  fonts: ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf'],
}

const here = () => dirname(fileURLToPath(import.meta.url))

let fonts: Uint8Array[] | undefined

function ready(): Uint8Array[] {
  return (fonts ??= PNG_ASSETS.fonts.map((f) => readFileSync(join(here(), f))))
}

let wasm: Promise<void> | undefined

/**
 * resvg reads `<style>` but not CSS custom properties, and the sheet's
 * colours are all `var(--x)` set on the root element, so they are written
 * in place first.
 */
export function flattenVars(svg: string): string {
  const vars = new Map<string, string>()
  for (const [, name, value] of svg.matchAll(/--([\w-]+)\s*:\s*([^;"]+)/g))
    if (name && value && !vars.has(name)) vars.set(name, value.trim())
  return svg.replace(
    /var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/g,
    (_, name: string, fallback?: string) =>
      vars.get(name) ?? fallback?.trim() ?? 'currentColor',
  )
}

/** render an SVG string to PNG bytes, `width` pixels wide */
export async function svgToPng(
  svg: string,
  width: number,
): Promise<Uint8Array> {
  return render(svg, width, (image) => image.asPng())
}

/** render an SVG string to raw RGBA pixels, `width` pixels wide, for a PDF */
export async function svgToPixels(
  svg: string,
  width: number,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  return render(svg, width, (image) => ({
    width: image.width,
    height: image.height,
    rgba: image.pixels.slice(),
  }))
}

async function render<T>(
  svg: string,
  width: number,
  take: (image: ReturnType<InstanceType<typeof Resvg>['render']>) => T,
): Promise<T> {
  wasm ??= initWasm(readFileSync(join(here(), PNG_ASSETS.wasm)))
  await wasm
  const r = new Resvg(flattenVars(svg), {
    fitTo: { mode: 'width', value: Math.round(width) },
    font: {
      fontBuffers: ready(),
      defaultFontFamily: 'Inter',
      sansSerifFamily: 'Inter',
      loadSystemFonts: false,
    },
  })
  try {
    const image = r.render()
    try {
      return take(image)
    } finally {
      image.free()
    }
  } finally {
    r.free()
  }
}

/*
 * A recording is hundreds of frames, and laying out each frame's text is
 * most of a frame's cost, so they are drawn by a few worker threads at once
 * and handed back in order. A worker is this same file started again with
 * RENDER_WORKER in its workerData: the built server is one script, and
 * serveRenders() is what it runs instead of the server when it is a worker.
 */

const RENDER_WORKER = 'anigramRenderWorker'

interface Job {
  i: number
  svg: string
  width: number
}

interface Done {
  i: number
  width: number
  height: number
  rgba: Uint8Array
}

/** true when this thread was started to draw frames, not to serve MCP */
export const isRenderWorker = (): boolean =>
  !isMainThread &&
  (workerData as Record<string, unknown> | null)?.[RENDER_WORKER] === true

/** a render worker's whole life: draw each frame it is sent and send its pixels back */
export function serveRenders() {
  parentPort!.on('message', (job: Job) => {
    void svgToPixels(job.svg, job.width).then(
      (px) =>
        parentPort!.postMessage({ i: job.i, ...px } satisfies Done, [
          px.rgba.buffer as ArrayBuffer,
        ]),
      (e: Error) => parentPort!.postMessage({ i: job.i, error: e.message }),
    )
  })
}

/** workers worth starting: a core left for the server and ffmpeg, eight at most */
const poolSize = (frames: number) =>
  Math.max(0, Math.min(8, availableParallelism() - 1, Math.floor(frames / 8)))

/**
 * Every frame as pixels, `width` wide, given to `take` in order. `take` is
 * awaited before more frames are drawn than the workers can hold, so a
 * long recording never sits in memory whole.
 */
export async function eachFrame(
  svgs: readonly string[],
  width: number,
  take: (px: Omit<Done, 'i'>, i: number) => Promise<void> | void,
): Promise<void> {
  const n = poolSize(svgs.length)
  if (n === 0) {
    for (let i = 0; i < svgs.length; i++)
      await take(await svgToPixels(svgs[i]!, width), i)
    return
  }
  const workers = Array.from(
    { length: n },
    () =>
      new Worker(fileURLToPath(import.meta.url), {
        workerData: { [RENDER_WORKER]: true },
      }),
  )
  const ready = new Map<number, Omit<Done, 'i'>>()
  // frames drawn but not yet taken stay few, however long the recording
  const ahead = 3 * n
  const idle = new Set<Worker>()
  let wake: (() => void) | null = null
  let failed: Error | null = null
  let next = 0
  let taken = 0
  const pump = (w: Worker) => {
    if (next < svgs.length && next - taken < ahead) {
      idle.delete(w)
      w.postMessage({ i: next, svg: svgs[next]!, width } satisfies Job)
      next++
    } else idle.add(w)
  }
  try {
    for (const w of workers) {
      w.on('message', (m: Done | { i: number; error: string }) => {
        if ('error' in m) failed ??= new Error(m.error)
        else ready.set(m.i, m)
        pump(w)
        wake?.()
      })
      w.on('error', (e) => {
        failed ??= e as Error
        wake?.()
      })
      pump(w)
    }
    for (let i = 0; i < svgs.length; i++) {
      while (!ready.has(i) && !failed)
        await new Promise<void>((ok) => (wake = ok))
      if (failed) throw failed
      const px = ready.get(i)!
      ready.delete(i)
      await take(px, i)
      taken++
      for (const w of [...idle]) pump(w)
    }
  } finally {
    await Promise.all(workers.map((w) => w.terminate()))
  }
}
