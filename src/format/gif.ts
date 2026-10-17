// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Animated GIF89a, written by hand so an export needs no library and runs
 * the same in the browser and in node.
 *
 * A sheet is flat colour, antialiased edges, text and thin lines on paper,
 * so the encoder is built for that rather than for photographs:
 *
 * - One global palette of up to 255 colours, picked from a histogram of
 *   a few sample frames. Flat fills keep their exact colour, and a colour
 *   is only picked over a more popular one when it is far from everything
 *   already chosen, so a thin red line is not crowded out by a hundred
 *   greys of antialiased text. No dithering: it speckles flat fills and blurs text.
 * - The 256th index means "unchanged since the last frame". After the first
 *   frame each one is cropped to the box of pixels that changed, and the
 *   rest of the box is that index, which LZW folds into almost nothing. A
 *   frame that changes nothing adds its delay to the one before instead.
 *
 * Alpha is ignored: frames are expected to be opaque, as a canvas capture
 * of the sheet is.
 */

type Pixels = Uint8Array | Uint8ClampedArray

export interface GifFrame {
  rgba: Pixels
  /** how long the frame shows, in milliseconds */
  delay: number
}

export interface GifOptions {
  /** loop forever (the default) or play once */
  loop?: boolean
}

/** the palette keeps one index of the 256 back for "unchanged" */
export const MAX_GIF_COLORS = 255

/** a sample this size finds every colour that matters and stays quick */
const SAMPLE_BUDGET = 4_000_000

/*
 * Picking colours: past this distance (squared, in the weighted metric
 * below, about 32 levels of grey) a colour competes on popularity alone;
 * closer to one already chosen, it is discounted.
 */
const NEAR = 9 * 32 * 32

function dist2(r1: number, g1: number, b1: number, rgb: number): number {
  const dr = r1 - (rgb >>> 16)
  const dg = g1 - ((rgb >>> 8) & 0xff)
  const db = b1 - (rgb & 0xff)
  // green counts most and blue least, roughly as the eye weighs them
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db
}

/** the 5:5:5 bin a colour falls in */
function binOf(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
}

export class GifPalette {
  /** packed 0xRRGGBB, most common first */
  readonly colors: readonly number[]
  private readonly exact = new Map<number, number>()
  // nearest colour per 5:5:5 bin, filled in as bins turn up
  private readonly cache = new Int16Array(32768).fill(-1)

  constructor(colors: readonly number[]) {
    if (colors.length < 1 || colors.length > MAX_GIF_COLORS) {
      throw new Error(
        `a GIF palette holds 1 to ${MAX_GIF_COLORS} colours, not ${colors.length}`,
      )
    }
    this.colors = colors.map((c) => c & 0xffffff)
    this.colors.forEach((c, i) => {
      if (!this.exact.has(c)) this.exact.set(c, i)
    })
  }

  /** the palette index a colour is drawn with */
  indexOf(r: number, g: number, b: number): number {
    const hit = this.exact.get((r << 16) | (g << 8) | b)
    if (hit !== undefined) return hit
    const bin = binOf(r, g, b)
    let index = this.cache[bin]!
    if (index < 0) {
      // nearest to the middle of the bin, so the answer holds for all of it
      index = this.nearest((r & 0xf8) | 4, (g & 0xf8) | 4, (b & 0xf8) | 4)
      this.cache[bin] = index
    }
    return index
  }

  /** every pixel of an RGBA frame as palette indices, into `out` */
  map(rgba: Pixels, out: Uint8Array): void {
    let last = -1
    let index = 0
    for (let p = 0, i = 0; p < out.length; p++, i += 4) {
      const rgb = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!
      // runs of one colour are most of a diagram, so look each run up once
      if (rgb !== last) {
        last = rgb
        index = this.indexOf(rgb >>> 16, (rgb >>> 8) & 0xff, rgb & 0xff)
      }
      out[p] = index
    }
  }

  private nearest(r: number, g: number, b: number): number {
    let best = 0
    let bestD = Infinity
    this.colors.forEach((c, i) => {
      const d = dist2(r, g, b, c)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }
}

/** exact colours with their counts, or null once there are too many */
function exactColors(frames: readonly Pixels[], max: number) {
  const counts = new Map<number, number>()
  for (const rgba of frames) {
    let last = -1
    let run = 0
    for (let i = 0; i < rgba.length; i += 4) {
      const rgb = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!
      if (rgb === last) {
        run++
        continue
      }
      if (run > 0) counts.set(last, (counts.get(last) ?? 0) + run)
      if (counts.size > max) return null
      last = rgb
      run = 1
    }
    if (run > 0) counts.set(last, (counts.get(last) ?? 0) + run)
    if (counts.size > max) return null
  }
  return counts
}

/**
 * The palette for a set of frames: every colour exactly when there are few
 * enough, otherwise a pick from a histogram of a sample of their pixels.
 * Pass all the frames, or an even spread of them when they arrive as a
 * stream; a colour the sample missed is drawn with its nearest.
 */
export function buildPalette(
  frames: readonly Pixels[],
  maxColors = MAX_GIF_COLORS,
): GifPalette {
  const max = Math.max(1, Math.min(MAX_GIF_COLORS, Math.floor(maxColors)))
  const few = exactColors(frames, max)
  if (few) {
    const colors = [...few].sort((a, b) => b[1] - a[1]).map(([c]) => c)
    return new GifPalette(colors.length ? colors : [0])
  }

  // a histogram of 5:5:5 bins, each remembering its mean and, by a running
  // majority vote, the one exact colour most of it may be
  const count = new Uint32Array(32768)
  const sum = new Float64Array(32768 * 3)
  const vote = new Int32Array(32768).fill(-1)
  const votes = new Uint32Array(32768)
  const total = frames.reduce((n, f) => n + (f.length >> 2), 0)
  // an odd step, so the sample does not line up with the columns
  const step = Math.max(1, Math.ceil(total / SAMPLE_BUDGET)) | 1

  const sample = (visit: (rgb: number, bin: number) => void) => {
    let offset = 0
    for (const rgba of frames) {
      const n = rgba.length >> 2
      let p = offset
      for (; p < n; p += step) {
        const i = p << 2
        const r = rgba[i]!
        const g = rgba[i + 1]!
        const b = rgba[i + 2]!
        visit((r << 16) | (g << 8) | b, binOf(r, g, b))
      }
      offset = p - n
    }
  }

  sample((rgb, bin) => {
    count[bin]!++
    sum[bin * 3]! += rgb >>> 16
    sum[bin * 3 + 1]! += (rgb >>> 8) & 0xff
    sum[bin * 3 + 2]! += rgb & 0xff
    if (vote[bin] === rgb) votes[bin]!++
    else if (votes[bin] === 0) {
      vote[bin] = rgb
      votes[bin] = 1
    } else votes[bin]!--
  })
  // the vote only names a candidate; count how often it really occurs
  const hits = new Uint32Array(32768)
  sample((rgb, bin) => {
    if (vote[bin] === rgb) hits[bin]!++
  })

  const bins: number[] = []
  const reps: number[] = []
  for (let bin = 0; bin < 32768; bin++) {
    const n = count[bin]!
    if (n === 0) continue
    bins.push(bin)
    if (hits[bin]! * 2 >= n) reps.push(vote[bin]!)
    else {
      const r = Math.round(sum[bin * 3]! / n)
      const g = Math.round(sum[bin * 3 + 1]! / n)
      const b = Math.round(sum[bin * 3 + 2]! / n)
      reps.push((r << 16) | (g << 8) | b)
    }
  }

  // greedy: the most popular first, then whatever is popular and far from
  // what is already in, until the palette is full
  const near = new Float64Array(bins.length).fill(Infinity)
  const colors: number[] = []
  while (colors.length < max) {
    let best = -1
    let bestScore = 0
    for (let j = 0; j < bins.length; j++) {
      const score = count[bins[j]!]! * Math.min(near[j]!, NEAR)
      if (score > bestScore) {
        bestScore = score
        best = j
      }
    }
    if (best < 0) break
    const c = reps[best]!
    colors.push(c)
    const r = c >>> 16
    const g = (c >>> 8) & 0xff
    const b = c & 0xff
    for (let j = 0; j < bins.length; j++) {
      const d = dist2(r, g, b, reps[j]!)
      if (d < near[j]!) near[j] = d
    }
  }
  return new GifPalette(colors)
}

/** a byte buffer that grows as it is written */
class Bytes {
  private buf = new Uint8Array(1 << 16)
  length = 0

  private room(n: number) {
    if (this.length + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.length + n) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.length))
    this.buf = next
  }

  byte(b: number) {
    this.room(1)
    this.buf[this.length++] = b
  }

  u16(n: number) {
    this.byte(n & 0xff)
    this.byte((n >> 8) & 0xff)
  }

  bytes(src: ArrayLike<number>) {
    this.room(src.length)
    this.buf.set(src, this.length)
    this.length += src.length
  }

  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i))
  }

  take(): Uint8Array {
    return this.buf.slice(0, this.length)
  }
}

/*
 * LZW as GIF wants it: variable-width codes from minCode + 1 bits up to 12,
 * a clear code first and whenever the table fills, packed least significant
 * bit first into sub-blocks of at most 255 bytes. The table is an open
 * hash keyed on (prefix code, next index), as in the classic compress.
 */
const HSIZE = 5003
const MAX_CODE = 4096

function lzw(
  pixels: Uint8Array,
  minCode: number,
  out: Bytes,
  htab: Int32Array,
  codetab: Int32Array,
) {
  const clear = 1 << minCode
  const eoi = clear + 1
  let size = minCode + 1
  let next = eoi + 1
  let acc = 0
  let bits = 0
  const block = new Uint8Array(255)
  let fill = 0

  const emit = (code: number) => {
    acc |= code << bits
    bits += size
    while (bits >= 8) {
      block[fill++] = acc & 0xff
      acc >>>= 8
      bits -= 8
      if (fill === 255) {
        out.byte(255)
        out.bytes(block)
        fill = 0
      }
    }
  }

  out.byte(minCode)
  htab.fill(-1)
  emit(clear)
  let ent = pixels[0]!
  outer: for (let p = 1; p < pixels.length; p++) {
    const c = pixels[p]!
    const fcode = (c << 12) + ent
    let i = (c << 4) ^ ent
    if (htab[i] === fcode) {
      ent = codetab[i]!
      continue
    }
    if (htab[i]! >= 0) {
      const disp = i === 0 ? 1 : HSIZE - i
      do {
        i -= disp
        if (i < 0) i += HSIZE
        if (htab[i] === fcode) {
          ent = codetab[i]!
          continue outer
        }
      } while (htab[i]! >= 0)
    }
    emit(ent)
    ent = c
    if (next < MAX_CODE) {
      // the decoder learns each code one step late, so the width grows
      // once the code just added needs the extra bit
      if (next === 1 << size) size++
      codetab[i] = next++
      htab[i] = fcode
    } else {
      emit(clear)
      htab.fill(-1)
      size = minCode + 1
      next = eoi + 1
    }
  }
  emit(ent)
  emit(eoi)
  if (bits > 0) block[fill++] = acc & 0xff
  if (fill > 0) {
    out.byte(fill)
    out.bytes(block.subarray(0, fill))
  }
  out.byte(0)
}

/**
 * Writes a GIF one frame at a time, holding only the last frame's indices
 * and the bytes written so far, so a long recording never has to sit in
 * memory as RGBA. The palette is global, so it has to exist before the
 * first frame: feed a few frames spread over the recording to `sample()`
 * first, or the first frame alone decides it.
 */
export class GifWriter {
  readonly width: number
  readonly height: number
  private readonly loop: boolean
  private palette: GifPalette | null
  private samples: Uint8Array[] = []
  private transparent = 0
  private minCode = 2
  private readonly chunks: Uint8Array[] = []
  private prev: Uint8Array
  private cur: Uint8Array
  private readonly htab = new Int32Array(HSIZE)
  private readonly codetab = new Int32Array(HSIZE)
  private frames = 0
  // the last frame is held back until we know whether the next one changes
  // anything, since its delay is written before its pixels
  private pending: Uint8Array | null = null
  private pendingStart = 0
  private clock = 0
  private done = false

  constructor(
    width: number,
    height: number,
    opts: GifOptions & { palette?: GifPalette } = {},
  ) {
    for (const [name, v] of [
      ['width', width],
      ['height', height],
    ] as const) {
      if (!Number.isInteger(v) || v < 1 || v > 65535) {
        throw new Error(
          `GIF ${name} must be a whole number of pixels from 1 to 65535, not ${v}`,
        )
      }
    }
    this.width = width
    this.height = height
    this.loop = opts.loop ?? true
    this.palette = opts.palette ?? null
    this.prev = new Uint8Array(width * height)
    this.cur = new Uint8Array(width * height)
  }

  /** a representative frame for the palette; only before the first add() */
  sample(rgba: Pixels): void {
    if (this.frames > 0 || this.done) {
      throw new Error('the palette is already fixed; sample() before add()')
    }
    this.check(rgba)
    // copied, since a capture loop usually reuses its buffer
    this.samples.push(Uint8Array.from(rgba))
  }

  /** encode one frame now; only the previous frame's indices are kept */
  add(frame: GifFrame): void {
    if (this.done) throw new Error('this GIF is already finished')
    this.check(frame.rgba)
    const { width: w, height: h } = this
    const delay = Number.isFinite(frame.delay) ? Math.max(0, frame.delay) : 0
    const cur = this.cur
    const prev = this.prev

    let image: Uint8Array
    if (this.frames === 0) {
      this.start(frame.rgba).map(frame.rgba, cur)
      image = this.image(0, 0, w, h, cur)
    } else {
      this.palette!.map(frame.rgba, cur)
      // the box around every pixel whose index changed
      let x0 = w
      let x1 = -1
      let y0 = -1
      let y1 = -1
      for (let y = 0; y < h; y++) {
        const row = y * w
        let first = -1
        for (let x = 0; x < w; x++) {
          if (cur[row + x] !== prev[row + x]) {
            first = x
            break
          }
        }
        if (first < 0) continue
        let last = w - 1
        while (cur[row + last] === prev[row + last]) last--
        if (y0 < 0) y0 = y
        y1 = y
        if (first < x0) x0 = first
        if (last > x1) x1 = last
      }
      if (y0 < 0) {
        // nothing changed: the frame before just shows for longer
        this.clock += delay
        this.frames++
        return
      }
      const cw = x1 - x0 + 1
      const ch = y1 - y0 + 1
      const crop = new Uint8Array(cw * ch)
      for (let y = 0; y < ch; y++) {
        const row = (y0 + y) * w + x0
        for (let x = 0; x < cw; x++) {
          const v = cur[row + x]!
          crop[y * cw + x] = v === prev[row + x] ? this.transparent : v
        }
      }
      image = this.image(x0, y0, cw, ch, crop)
    }

    this.flush()
    this.pending = image
    this.pendingStart = this.clock
    this.clock += delay
    this.frames++
    this.prev = cur
    this.cur = prev
  }

  /** shows the last frame `ms` longer, say to rest before the loop restarts */
  hold(ms: number): void {
    if (this.done) throw new Error('this GIF is already finished')
    if (!this.pending) throw new Error('hold() needs a frame to hold')
    if (Number.isFinite(ms) && ms > 0) this.clock += ms
  }

  finish(): Uint8Array {
    if (this.done) throw new Error('this GIF is already finished')
    if (this.frames === 0) throw new Error('a GIF needs at least one frame')
    this.flush()
    this.chunks.push(Uint8Array.of(0x3b))
    this.done = true
    const out = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0))
    let at = 0
    for (const c of this.chunks) {
      out.set(c, at)
      at += c.length
    }
    this.chunks.length = 0
    return out
  }

  private check(rgba: Pixels) {
    const { width: w, height: h } = this
    if (rgba.length !== w * h * 4) {
      throw new Error(
        `frame ${this.frames} has ${rgba.length} bytes; a ${w}×${h} RGBA frame has ${w * h * 4}`,
      )
    }
  }

  /** fixes the palette and writes everything that comes before the frames */
  private start(first: Pixels): GifPalette {
    const palette =
      this.palette ?? buildPalette(this.samples.length ? this.samples : [first])
    this.palette = palette
    this.samples = []
    this.transparent = palette.colors.length

    // the table holds the colours plus the "unchanged" index, rounded up
    // to a power of two as the format requires
    let tableBits = 1
    while (1 << tableBits < this.transparent + 1) tableBits++
    this.minCode = Math.max(2, tableBits)

    const out = new Bytes()
    out.ascii('GIF89a')
    out.u16(this.width)
    out.u16(this.height)
    out.byte(0x80 | (7 << 4) | (tableBits - 1)) // global table, 8-bit colour
    out.byte(0) // background index
    out.byte(0) // square pixels
    for (let i = 0; i < 1 << tableBits; i++) {
      const c = palette.colors[i] ?? 0
      out.byte(c >>> 16)
      out.byte((c >>> 8) & 0xff)
      out.byte(c & 0xff)
    }
    if (this.loop) {
      out.bytes([0x21, 0xff, 11])
      out.ascii('NETSCAPE2.0')
      out.bytes([3, 1, 0, 0, 0]) // loop count 0: forever
    }
    this.chunks.push(out.take())
    return palette
  }

  private image(x: number, y: number, w: number, h: number, px: Uint8Array) {
    const b = new Bytes()
    b.byte(0x2c)
    b.u16(x)
    b.u16(y)
    b.u16(w)
    b.u16(h)
    b.byte(0) // no local table, not interlaced
    lzw(px, this.minCode, b, this.htab, this.codetab)
    return b.take()
  }

  private flush() {
    if (!this.pending) return
    // delays come from the running clock, so rounding to centiseconds does
    // not drift over a long animation; browsers play under 2cs slowly
    const cs = Math.round(this.clock / 10) - Math.round(this.pendingStart / 10)
    const delay = Math.min(65535, Math.max(2, cs))
    // graphic control: leave the frame in place, "unchanged" is transparent
    this.chunks.push(
      Uint8Array.of(
        0x21,
        0xf9,
        4,
        (1 << 2) | 1,
        delay & 0xff,
        delay >> 8,
        this.transparent,
        0,
      ),
      this.pending,
    )
    this.pending = null
  }
}

/**
 * A whole animation in one call. The frames are all in memory already, so
 * the palette is built from every one of them rather than a sample.
 */
export function encodeGif(
  width: number,
  height: number,
  frames: readonly GifFrame[],
  opts: GifOptions = {},
): Uint8Array {
  const palette = buildPalette(frames.map((f) => f.rgba))
  const writer = new GifWriter(width, height, { ...opts, palette })
  for (const f of frames) writer.add(f)
  return writer.finish()
}
