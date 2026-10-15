// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPalette, encodeGif, GifWriter } from './gif.ts'
import type { GifFrame } from './gif.ts'

/*
 * A small GIF decoder, written apart from the encoder so a round trip
 * checks the bytes against the format rather than against itself: LZW,
 * then each frame drawn over the last at its offset, skipping its
 * transparent index.
 */
interface Decoded {
  width: number
  height: number
  palette: number[]
  loop: boolean
  frames: {
    delay: number
    x: number
    y: number
    w: number
    h: number
    rgba: Uint8Array
  }[]
}

function decodeGif(buf: Uint8Array): Decoded {
  let at = 0
  const byte = () => {
    if (at >= buf.length) throw new Error('ran off the end')
    return buf[at++]!
  }
  const u16 = () => byte() | (byte() << 8)
  const ascii = (n: number) =>
    String.fromCharCode(...buf.subarray(at, (at += n)))
  const blocks = () => {
    const parts: number[] = []
    for (let n = byte(); n > 0; n = byte()) {
      for (let i = 0; i < n; i++) parts.push(byte())
    }
    return parts
  }

  assert.equal(ascii(6), 'GIF89a')
  const width = u16()
  const height = u16()
  const packed = byte()
  byte()
  byte()
  const palette: number[] = []
  if (packed & 0x80) {
    for (let i = 0; i < 1 << ((packed & 7) + 1); i++) {
      palette.push((byte() << 16) | (byte() << 8) | byte())
    }
  }
  const canvas = new Uint8Array(width * height * 4)
  const out: Decoded = { width, height, palette, loop: false, frames: [] }
  let delay = 0
  let transparent = -1

  for (;;) {
    const kind = byte()
    if (kind === 0x3b) break
    if (kind === 0x21) {
      const label = byte()
      if (label === 0xf9) {
        assert.equal(byte(), 4)
        const flags = byte()
        delay = u16()
        const t = byte()
        transparent = flags & 1 ? t : -1
        assert.equal((flags >> 2) & 7, 1, 'disposal: do not dispose')
        assert.equal(byte(), 0)
      } else if (label === 0xff) {
        const size = byte()
        const app = ascii(size)
        const data = blocks()
        if (app === 'NETSCAPE2.0') out.loop = data[0] === 1
      } else blocks()
      continue
    }
    assert.equal(kind, 0x2c, `unexpected block 0x${kind.toString(16)}`)
    const x = u16()
    const y = u16()
    const w = u16()
    const h = u16()
    assert.equal(byte() & 0x80, 0, 'no local tables expected')
    assert.ok(x + w <= width && y + h <= height, 'frame inside the canvas')
    const minCode = byte()
    const indices = lzwDecode(blocks(), minCode, w * h)
    for (let p = 0; p < w * h; p++) {
      const v = indices[p]!
      if (v === transparent) continue
      const c = palette[v]
      assert.ok(c !== undefined, `index ${v} past the palette`)
      const i = ((y + Math.floor(p / w)) * width + x + (p % w)) * 4
      canvas[i] = c >>> 16
      canvas[i + 1] = (c >>> 8) & 0xff
      canvas[i + 2] = c & 0xff
      canvas[i + 3] = 255
    }
    out.frames.push({ delay, x, y, w, h, rgba: canvas.slice() })
  }
  assert.equal(at, buf.length, 'nothing after the trailer')
  return out
}

function lzwDecode(data: number[], minCode: number, count: number) {
  const clear = 1 << minCode
  const eoi = clear + 1
  const out = new Uint8Array(count)
  let n = 0
  let size = minCode + 1
  let dict: number[][] = []
  const reset = () => {
    dict = []
    for (let i = 0; i < clear; i++) dict.push([i])
    dict.push([], [])
    size = minCode + 1
  }
  reset()
  let prev: number[] | null = null
  let bitPos = 0
  const total = data.length * 8
  for (;;) {
    assert.ok(bitPos + size <= total, 'image data ended without an end code')
    let code = 0
    for (let b = 0; b < size; b++, bitPos++) {
      code |= ((data[bitPos >> 3]! >> (bitPos & 7)) & 1) << b
    }
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    if (code === eoi) break
    let entry: number[]
    if (code < dict.length) entry = dict[code]!
    else {
      assert.ok(prev && code === dict.length, `bad code ${code}`)
      entry = [...prev, prev[0]!]
    }
    for (const v of entry) out[n++] = v
    if (prev && dict.length < 4096) {
      dict.push([...prev, entry[0]!])
      if (dict.length === 1 << size && size < 12) size++
    }
    prev = entry
  }
  assert.equal(n, count, 'pixel count')
  return out
}

// ---- synthetic frames ---------------------------------------------------

type RGB = readonly [number, number, number]

function blank(w: number, h: number, c: RGB) {
  const px = new Uint8Array(w * h * 4)
  for (let i = 0; i < px.length; i += 4) {
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
    px[i + 3] = 255
  }
  return px
}

function rect(
  px: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: RGB,
) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
    }
  }
}

const PAPER: RGB = [243, 236, 221]
const INK: RGB = [17, 17, 17]
const NEON: RGB = [255, 46, 99]
const TEAL: RGB = [20, 150, 160]

/** paper, ink lines, a red and a teal line, a soft-edged blob and a moving dot */
function diagram(w: number, h: number, t: number) {
  const px = blank(w, h, PAPER)
  for (let y = 20; y < h - 20; y += 40) rect(px, w, 10, y, w - 10, y + 1, INK)
  rect(px, w, 30, 10, 31, h - 10, NEON)
  rect(px, w, 60, 10, 62, h - 10, TEAL)
  // an antialiased edge: ink fading into paper across 24 pixels
  for (let x = 0; x < 24; x++) {
    const a = x / 23
    const c: RGB = [
      Math.round(INK[0] * (1 - a) + PAPER[0] * a),
      Math.round(INK[1] * (1 - a) + PAPER[1] * a),
      Math.round(INK[2] * (1 - a) + PAPER[2] * a),
    ]
    rect(px, w, 100 + x, 40, 101 + x, 80, c)
  }
  // a dot that slides along, with a one-pixel soft ring
  const cx = 140 + t * 6
  rect(px, w, cx - 1, 99, cx + 9, 109, [200, 120, 130])
  rect(px, w, cx, 100, cx + 8, 108, NEON)
  return px
}

// ---- tests ---------------------------------------------------------------

test('a few flat colours come back exactly, with delays and the loop flag', () => {
  const w = 7
  const h = 5
  const a = blank(w, h, PAPER)
  rect(a, w, 1, 1, 3, 4, INK)
  const b = a.slice()
  rect(b, w, 4, 2, 6, 3, NEON)
  const c = b.slice()
  rect(c, w, 0, 0, 1, 1, TEAL)
  const gif = encodeGif(w, h, [
    { rgba: a, delay: 100 },
    { rgba: b, delay: 50 },
    { rgba: c, delay: 1000 },
  ])
  const d = decodeGif(gif)
  assert.equal(d.width, w)
  assert.equal(d.height, h)
  assert.equal(d.loop, true)
  assert.deepEqual(
    d.frames.map((f) => f.delay),
    [10, 5, 100],
  )
  assert.deepEqual(d.frames[0]!.rgba, a)
  assert.deepEqual(d.frames[1]!.rgba, b)
  assert.deepEqual(d.frames[2]!.rgba, c)
  // later frames are cropped to what changed
  assert.deepEqual(
    [d.frames[1]!.x, d.frames[1]!.y, d.frames[1]!.w, d.frames[1]!.h],
    [4, 2, 2, 1],
  )
  assert.deepEqual(
    [d.frames[2]!.x, d.frames[2]!.y, d.frames[2]!.w, d.frames[2]!.h],
    [0, 0, 1, 1],
  )

  const once = decodeGif(
    encodeGif(w, h, [{ rgba: a, delay: 10 }], { loop: false }),
  )
  assert.equal(once.loop, false)
  assert.equal(once.frames[0]!.delay, 2, 'never under 2cs')
})

test('255 distinct colours are all kept exactly', () => {
  const w = 17
  const h = 15
  const px = new Uint8Array(w * h * 4)
  for (let p = 0; p < w * h; p++) {
    px[p * 4] = p
    px[p * 4 + 1] = (p * 7) & 0xff
    px[p * 4 + 2] = 255 - p
    px[p * 4 + 3] = 255
  }
  const d = decodeGif(encodeGif(w, h, [{ rgba: px, delay: 40 }]))
  assert.deepEqual(d.frames[0]!.rgba, px)
})

test('identical frames merge into the delay of the one before', () => {
  const w = 200
  const h = 120
  const f0 = diagram(w, h, 0)
  const f1 = diagram(w, h, 1)
  const frames: GifFrame[] = [
    { rgba: f0, delay: 100 },
    { rgba: f0.slice(), delay: 100 },
    { rgba: f0.slice(), delay: 100 },
    { rgba: f1, delay: 100 },
    { rgba: f1.slice(), delay: 230 },
  ]
  const d = decodeGif(encodeGif(w, h, frames))
  assert.deepEqual(
    d.frames.map((f) => f.delay),
    [30, 33],
  )
})

test('a diagram round-trips through its palette and stays small', () => {
  const w = 240
  const h = 160
  const frames: GifFrame[] = []
  for (let t = 0; t < 12; t++)
    frames.push({ rgba: diagram(w, h, t), delay: 80 })
  const gif = encodeGif(w, h, frames)
  const d = decodeGif(gif)
  assert.equal(d.frames.length, 12)
  assert.ok(gif.length < (w * h * 4 * 12) / 50, `${gif.length} bytes`)

  // the encoder's own palette is what every pixel must come back as
  const palette = buildPalette(frames.map((f) => f.rgba))
  const indices = new Uint8Array(w * h)
  frames.forEach((f, k) => {
    palette.map(f.rgba, indices)
    const got = d.frames[k]!.rgba
    for (let p = 0; p < w * h; p++) {
      const c = palette.colors[indices[p]!]!
      const i = p * 4
      assert.equal(
        (got[i]! << 16) | (got[i + 1]! << 8) | got[i + 2]!,
        c,
        `frame ${k} pixel ${p}`,
      )
    }
    // later frames only cover the dot's path
    if (k > 0) assert.ok(d.frames[k]!.w * d.frames[k]!.h < 200)
  })
})

test('many colours: flat fills and thin lines stay exact, the rest stays close', () => {
  const w = 256
  const h = 120
  const px = blank(w, h, PAPER)
  // a full gradient band: thousands of colours the palette cannot all hold
  for (let y = 60; y < 120; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * w + x) * 4
      px[i] = x
      px[i + 1] = (y - 60) * 4
      px[i + 2] = 255 - x
    }
  }
  rect(px, w, 0, 10, w, 11, NEON)
  rect(px, w, 0, 20, w, 21, TEAL)
  rect(px, w, 0, 30, w, 32, INK)
  const d = decodeGif(encodeGif(w, h, [{ rgba: px, delay: 100 }]))
  const got = d.frames[0]!.rgba
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return [got[i], got[i + 1], got[i + 2]]
  }
  assert.deepEqual(at(5, 5), [...PAPER])
  assert.deepEqual(at(100, 10), [...NEON])
  assert.deepEqual(at(100, 20), [...TEAL])
  assert.deepEqual(at(100, 31), [...INK])
  let err = 0
  for (let i = 0; i < px.length; i += 4) {
    err += Math.abs(px[i]! - got[i]!) + Math.abs(px[i + 1]! - got[i + 1]!)
    err += Math.abs(px[i + 2]! - got[i + 2]!)
  }
  assert.ok(err / (w * h * 3) < 6, `mean error ${err / (w * h * 3)}`)
})

test('1×1 and odd sizes', () => {
  for (const [w, h] of [
    [1, 1],
    [3, 1],
    [1, 7],
    [13, 11],
    [101, 3],
  ] as const) {
    const a = blank(w, h, INK)
    const b = blank(w, h, NEON)
    if (w * h > 2) rect(b, w, 0, 0, 1, 1, INK)
    const d = decodeGif(
      encodeGif(w, h, [
        { rgba: a, delay: 20 },
        { rgba: b, delay: 20 },
      ]),
    )
    assert.equal(d.frames.length, 2, `${w}×${h}`)
    assert.deepEqual(d.frames[0]!.rgba, a)
    assert.deepEqual(d.frames[1]!.rgba, b)
  }
})

test('long runs cross the 12-bit table limit and still decode', () => {
  const w = 300
  const h = 200
  const px = new Uint8Array(w * h * 4)
  // pseudo-random over a few colours fills the code table many times
  let s = 1
  for (let i = 0; i < px.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0
    const c = [PAPER, INK, NEON, TEAL][s >>> 30]!
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
    px[i + 3] = 255
  }
  const d = decodeGif(encodeGif(w, h, [{ rgba: px, delay: 50 }]))
  assert.deepEqual(d.frames[0]!.rgba, px)
})

test('streaming: sampled palette, frames one at a time, a hold at the end', () => {
  const w = 200
  const h = 120
  const writer = new GifWriter(w, h)
  // the capture buffer is reused, as a canvas readback loop would
  const buf = new Uint8Array(w * h * 4)
  for (const t of [0, 5, 10]) {
    buf.set(diagram(w, h, t))
    writer.sample(buf)
  }
  for (let t = 0; t <= 10; t++) {
    buf.set(diagram(w, h, t))
    writer.add({ rgba: buf, delay: 100 })
  }
  writer.hold(1500)
  const d = decodeGif(writer.finish())
  assert.equal(d.frames.length, 11)
  assert.deepEqual(
    d.frames.map((f) => f.delay),
    [...Array(10).fill(10), 160],
  )
  // every colour was in the samples, so the frames come back exactly
  assert.deepEqual(d.frames[10]!.rgba, diagram(w, h, 10))
  assert.throws(() => writer.add({ rgba: buf, delay: 10 }), /finished/)
})

test('with no samples the first frame decides the palette', () => {
  const w = 20
  const h = 10
  const a = blank(w, h, PAPER)
  rect(a, w, 10, 2, 12, 8, INK)
  const b = a.slice()
  // a colour the first frame never showed: drawn with its nearest, ink
  rect(b, w, 2, 2, 5, 5, [40, 10, 20])
  const writer = new GifWriter(w, h)
  writer.add({ rgba: a, delay: 50 })
  writer.add({ rgba: b, delay: 50 })
  const d = decodeGif(writer.finish())
  assert.deepEqual(d.palette.slice(0, 2), [0xf3ecdd, 0x111111])
  assert.equal(d.frames.length, 2)
  assert.deepEqual(d.frames[0]!.rgba, a)
  const i = (3 * w + 3) * 4
  assert.deepEqual([...d.frames[1]!.rgba.subarray(i, i + 3)], [...INK])
})

test('the writer refuses bad input', () => {
  assert.throws(() => new GifWriter(0, 2), /width/)
  const writer = new GifWriter(2, 2)
  assert.throws(() => writer.finish(), /at least one frame/)
  assert.throws(() => writer.hold(100), /a frame to hold/)
  assert.throws(
    () => writer.add({ rgba: new Uint8Array(4), delay: 10 }),
    /2×2 RGBA frame has 16/,
  )
  assert.throws(() => writer.sample(new Uint8Array(8)), /2×2 RGBA/)
  writer.add({ rgba: blank(2, 2, INK), delay: 10 })
  assert.throws(() => writer.sample(blank(2, 2, INK)), /before add/)
})
