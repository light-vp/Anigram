// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { GifWriter } from '../format/gif.ts'
import { Mp4Muxer } from '../format/mp4.ts'
import type { Controls } from '../format/report.ts'
import { frameRuns, record, storyboard } from '../format/storyboard.ts'
import type { Storyboard } from '../format/storyboard.ts'
import type { Scene } from '../sim/types.ts'
import type { ThemeId } from '../view/palette.ts'
import {
  frameSize,
  renderFrameSvg,
  renderStoryboardSvg,
} from '../view/storyboardSvg.tsx'

/*
 * The storyboard dialog's heavy half, loaded only when someone opens it: the
 * board, and recordings of the day as GIF or MP4, made in the browser. Each
 * frame is the same SVG the MCP server rasterises in node, drawn onto a
 * canvas here; an MP4 goes through the browser's own H.264 encoder
 * (WebCodecs), so nothing is uploaded and no encoder ships in the bundle.
 */

export interface RecordingOptions extends Controls {
  theme: ThemeId
  /** frame width in pixels (default 800) */
  width?: number
  seconds?: number
  fps?: number
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export function makeBoard(scene: Scene, controls: Controls): Storyboard {
  return storyboard(scene, controls)
}

export function boardSvg(
  scene: Scene,
  board: Storyboard,
  controls: Controls,
  theme: ThemeId,
): string {
  return renderStoryboardSvg(scene, board, { ...controls, theme })
}

/** an SVG string drawn onto a canvas `width` × `height` */
async function draw(
  svg: string,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<void> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image(width, height)
    img.src = url
    await img.decode()
    ctx.drawImage(img, 0, 0, width, height)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** the day's frames as SVG strings, with the size to draw them at */
function frames(scene: Scene, opts: RecordingOptions) {
  const fps = opts.fps ?? 12
  const board = storyboard(scene, opts)
  const runs = frameRuns(board, { seconds: opts.seconds, fps })
  const svgs: string[] = []
  record(scene, runs, { ...opts, fps }, (frame, _sim, i) =>
    svgs.push(
      renderFrameSvg(scene, frame, {
        theme: opts.theme,
        progress: runs.length > 1 ? i / (runs.length - 1) : 1,
      }),
    ),
  )
  const size = frameSize(scene)
  // even sides, as H.264 wants
  const width = 2 * Math.round((opts.width ?? 800) / 2)
  const height = 2 * Math.round((width * size.h) / size.w / 2)
  return { svgs, fps, width, height }
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('this browser cannot draw to a canvas')
  return { c, ctx }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

export async function recordGif(
  scene: Scene,
  opts: RecordingOptions,
): Promise<Blob> {
  const { svgs, fps, width, height } = frames(scene, opts)
  const { ctx } = canvas(width, height)
  const pixels = async (svg: string) => {
    await draw(svg, ctx, width, height)
    return ctx.getImageData(0, 0, width, height).data
  }
  // the palette from a few frames across the day, then one frame at a time,
  // so a long recording never holds more than a frame or two
  const writer = new GifWriter(width, height)
  for (const k of [0, 1, 2, 3])
    writer.sample(await pixels(svgs[Math.floor((k * (svgs.length - 1)) / 3)]!))
  for (let i = 0; i < svgs.length; i++) {
    opts.signal?.throwIfAborted()
    writer.add({ rgba: await pixels(svgs[i]!), delay: 1000 / fps })
    opts.onProgress?.(i + 1, svgs.length + 1)
    if (i % 4 === 3) await tick()
  }
  writer.hold(1500)
  const gif = writer.finish()
  opts.onProgress?.(svgs.length + 1, svgs.length + 1)
  return new Blob([gif as BlobPart], { type: 'image/gif' })
}

/** the first H.264 profile this browser can encode at this size, if any */
export async function mp4Codec(
  width: number,
  height: number,
): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null
  for (const codec of ['avc1.42E01F', 'avc1.4D401F', 'avc1.640028']) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height })
      if (r.supported) return codec
    } catch {
      // try the next one
    }
  }
  return null
}

export async function canRecordMp4(): Promise<boolean> {
  return (await mp4Codec(800, 600)) !== null
}

export async function recordMp4(
  scene: Scene,
  opts: RecordingOptions,
): Promise<Blob> {
  const { svgs, fps, width, height } = frames(scene, opts)
  const codec = await mp4Codec(width, height)
  if (!codec) throw new Error('this browser cannot encode H.264 video')
  const { c, ctx } = canvas(width, height)
  const muxer = new Mp4Muxer({ width, height })
  let failed: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const description = meta?.decoderConfig?.description
      if (description)
        muxer.setConfig(
          ArrayBuffer.isView(description)
            ? new Uint8Array(
                description.buffer,
                description.byteOffset,
                description.byteLength,
              )
            : new Uint8Array(description),
        )
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      muxer.add({
        data,
        timestamp: chunk.timestamp,
        duration: chunk.duration ?? 1e6 / fps,
        key: chunk.type === 'key',
      })
    },
    error: (e) => (failed = e instanceof Error ? e : new Error(String(e))),
  })
  encoder.configure({
    codec,
    width,
    height,
    bitrate: 2_500_000,
    framerate: fps,
    avc: { format: 'avc' },
  })
  const step = 1e6 / fps
  for (let i = 0; i < svgs.length; i++) {
    opts.signal?.throwIfAborted()
    if (failed) throw failed
    await draw(svgs[i]!, ctx, width, height)
    const frame = new VideoFrame(c, { timestamp: i * step, duration: step })
    // a key frame every two seconds, so a player can seek
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
    frame.close()
    opts.onProgress?.(i + 1, svgs.length + 1)
    if (encoder.encodeQueueSize > 4) await tick()
  }
  await encoder.flush()
  encoder.close()
  if (failed) throw failed
  const mp4 = muxer.finish()
  opts.onProgress?.(svgs.length + 1, svgs.length + 1)
  return new Blob([mp4 as BlobPart], { type: 'video/mp4' })
}
