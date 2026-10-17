// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * A minimal MP4 (ISO BMFF) writer for one H.264 video track, fed by the
 * browser's own encoder: WebCodecs hands over AVCC samples (length-prefixed
 * NAL units) and an avcC record, and all that is left is the boxes around
 * them. Hand-written so an export needs no library.
 *
 * The file is plain and "faststart": ftyp, then moov with every table, then
 * one mdat holding the samples as a single chunk. Putting moov first means
 * a browser can start playing before the whole file has arrived, at the
 * cost of holding the samples until finish(), which for a sheet's few
 * seconds of flat-colour video is a few megabytes.
 *
 * Samples must arrive in presentation order, as they do from an encoder
 * with no B-frames (the baseline profile has none), so no ctts is written.
 */

export interface Mp4Sample {
  data: Uint8Array
  /** microseconds, as WebCodecs gives them */
  timestamp: number
  duration: number
  key: boolean
}

export interface Mp4Options {
  width: number
  height: number
  /** ticks per second for the track; 90 kHz divides every common frame rate */
  timescale?: number
}

const U32 = 2 ** 32

/** a run of big-endian fields */
function fields(spec: readonly (readonly [bits: 8 | 16 | 32, n: number])[]) {
  const out = new Uint8Array(spec.reduce((s, [bits]) => s + bits / 8, 0))
  const view = new DataView(out.buffer)
  let at = 0
  for (const [bits, n] of spec) {
    if (bits === 8) view.setUint8(at, n)
    else if (bits === 16) view.setUint16(at, n)
    else view.setUint32(at, n)
    at += bits / 8
  }
  return out
}

const u32 = (n: number) => fields([[32, n]])
const u16 = (n: number) => fields([[16, n]])

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0))
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(parts)
  return concat([u32(8 + body.length), ascii(type), body])
}

/** a box with a version byte and 24 bits of flags before its fields */
function fullBox(
  type: string,
  version: number,
  flags: number,
  ...parts: Uint8Array[]
) {
  return box(type, u32(((version & 0xff) << 24) | (flags & 0xffffff)), ...parts)
}

/** a table of big-endian 32-bit numbers, `width` to an entry, behind its entry count */
function table(entries: ArrayLike<number>, width = 1): Uint8Array {
  const out = new Uint8Array(4 + entries.length * 4)
  const view = new DataView(out.buffer)
  view.setUint32(0, entries.length / width)
  for (let i = 0; i < entries.length; i++)
    view.setUint32(4 + i * 4, entries[i]!)
  return out
}

// the identity transform, in 16.16 and 2.30 fixed point
const MATRIX = concat(
  [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map((n) => u32(n)),
)

export class Mp4Muxer {
  private readonly width: number
  private readonly height: number
  private readonly timescale: number
  private config: Uint8Array | null = null
  private readonly samples: Uint8Array[] = []
  private readonly times: number[] = []
  private readonly durations: number[] = []
  private readonly keys: number[] = []
  private done = false

  constructor(opts: Mp4Options) {
    const { width, height, timescale = 90000 } = opts
    for (const [name, v] of [
      ['width', width],
      ['height', height],
    ] as const) {
      if (!Number.isInteger(v) || v < 1 || v > 65535) {
        throw new Error(
          `MP4 ${name} must be a whole number of pixels from 1 to 65535, not ${v}`,
        )
      }
    }
    if (!Number.isInteger(timescale) || timescale < 1 || timescale >= U32) {
      throw new Error(
        `MP4 timescale must be a whole number of ticks per second, not ${timescale}`,
      )
    }
    this.width = width
    this.height = height
    this.timescale = timescale
  }

  /** description = the avcC record (from EncodedVideoChunkMetadata.decoderConfig.description), needed once before finish */
  setConfig(description: Uint8Array): void {
    if (description.length < 7 || description[0] !== 1) {
      throw new Error(
        'the decoder config is not an avcC record; configure the encoder with avc: { format: "avc" }',
      )
    }
    this.config = description.slice()
  }

  /** one encoded frame; timestamp and duration in microseconds as WebCodecs gives them */
  add(sample: Mp4Sample): void {
    if (this.done) throw new Error('this MP4 is already finished')
    const n = this.samples.length
    if (n === 0 && !sample.key) {
      throw new Error('the first sample must be a key frame')
    }
    const last = this.times[n - 1]
    if (last !== undefined && !(sample.timestamp > last)) {
      throw new Error(
        `sample ${n} at ${sample.timestamp}µs is not after the one before at ${last}µs; samples must arrive in presentation order`,
      )
    }
    // copied, since a caller may reuse its buffer for the next chunk
    this.samples.push(sample.data.slice())
    this.times.push(sample.timestamp)
    this.durations.push(Math.max(0, sample.duration || 0))
    if (sample.key) this.keys.push(n + 1)
  }

  finish(): Uint8Array {
    if (this.done) throw new Error('this MP4 is already finished')
    if (!this.config)
      throw new Error('setConfig() needs the avcC record before finish()')
    const n = this.samples.length
    if (n === 0) throw new Error('an MP4 needs at least one sample')

    // each sample lasts until the next one starts, measured on the track's
    // clock from the first timestamp, so rounding never drifts
    const t0 = this.times[0]!
    const ticks = (us: number) => Math.round(((us - t0) * this.timescale) / 1e6)
    const deltas: number[] = []
    for (let i = 0; i + 1 < n; i++) {
      deltas.push(ticks(this.times[i + 1]!) - ticks(this.times[i]!))
    }
    const lastUs = this.durations[n - 1]!
    const lastTicks =
      lastUs > 0
        ? ticks(this.times[n - 1]! + lastUs) - ticks(this.times[n - 1]!)
        : (deltas[deltas.length - 1] ?? Math.round(this.timescale / 30))
    deltas.push(Math.max(1, lastTicks))
    const duration = deltas.reduce((s, d) => s + d, 0)
    if (duration >= U32)
      throw new Error('the video is too long for a 32-bit MP4 duration')

    // stts: runs of equal durations
    const stts: number[] = []
    for (const d of deltas) {
      if (stts.length && stts[stts.length - 1] === d) stts[stts.length - 2]!++
      else stts.push(1, d)
    }
    const sttsBox = fullBox('stts', 0, 0, table(stts, 2))

    const mdatSize = 8 + this.samples.reduce((s, x) => s + x.length, 0)
    const ftyp = box(
      'ftyp',
      ascii('isom'),
      u32(0x200),
      ascii('isom'),
      ascii('iso2'),
      ascii('avc1'),
      ascii('mp41'),
    )

    const moov = (chunkOffset: number) => {
      const { width: w, height: h, timescale } = this
      const avc1 = box(
        'avc1',
        new Uint8Array(6), // reserved
        u16(1), // data reference index
        new Uint8Array(16), // pre-defined and reserved
        fields([
          [16, w],
          [16, h],
          [32, 0x480000], // 72 dpi
          [32, 0x480000],
          [32, 0],
          [16, 1], // one frame per sample
        ]),
        new Uint8Array(32), // compressor name, empty
        fields([
          [16, 0x18], // colour, no alpha
          [16, 0xffff], // pre-defined -1
        ]),
        box('avcC', this.config!),
      )
      const stbl = box(
        'stbl',
        fullBox('stsd', 0, 0, u32(1), avc1),
        sttsBox,
        fullBox('stss', 0, 0, table(this.keys)),
        // one chunk holding every sample
        fullBox('stsc', 0, 0, table([1, n, 1], 3)),
        fullBox('stsz', 0, 0, u32(0), table(this.samples.map((s) => s.length))),
        fullBox('stco', 0, 0, table([chunkOffset])),
      )
      const minf = box(
        'minf',
        fullBox('vmhd', 0, 1, new Uint8Array(8)),
        box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
        stbl,
      )
      const mdia = box(
        'mdia',
        fullBox(
          'mdhd',
          0,
          0,
          fields([
            [32, 0],
            [32, 0],
            [32, timescale],
            [32, duration],
            // 'und', five bits a letter
            [16, ((0x75 - 0x60) << 10) | ((0x6e - 0x60) << 5) | (0x64 - 0x60)],
            [16, 0],
          ]),
        ),
        fullBox(
          'hdlr',
          0,
          0,
          u32(0),
          ascii('vide'),
          new Uint8Array(12),
          ascii('Anigram\0'),
        ),
        minf,
      )
      const tkhd = fullBox(
        'tkhd',
        0,
        3, // enabled, in the movie
        fields([
          [32, 0],
          [32, 0],
          [32, 1], // track id
          [32, 0],
          [32, duration],
          [32, 0],
          [32, 0],
          [16, 0], // layer
          [16, 0], // alternate group
          [16, 0], // volume: none for video
          [16, 0],
        ]),
        MATRIX,
        fields([
          [32, w * 0x10000],
          [32, h * 0x10000],
        ]),
      )
      const mvhd = fullBox(
        'mvhd',
        0,
        0,
        fields([
          [32, 0],
          [32, 0],
          [32, timescale],
          [32, duration],
          [32, 0x10000], // rate 1.0
          [16, 0x100], // volume 1.0
          [16, 0],
          [32, 0],
          [32, 0],
        ]),
        MATRIX,
        new Uint8Array(24), // pre-defined
        u32(2), // next track id
      )
      return box('moov', mvhd, box('trak', tkhd, mdia))
    }

    // moov's size does not depend on the offset it holds, so measure once
    const head = ftyp.length + moov(0).length
    if (head + mdatSize >= U32) {
      throw new Error('the video is over 4 GB, past what a 32-bit MP4 can hold')
    }
    const out = new Uint8Array(head + mdatSize)
    out.set(ftyp, 0)
    out.set(moov(head + 8), ftyp.length)
    new DataView(out.buffer).setUint32(head, mdatSize)
    out.set(ascii('mdat'), head + 4)
    let at = head + 8
    for (const s of this.samples) {
      out.set(s, at)
      at += s.length
    }
    this.done = true
    this.samples.length = 0
    return out
  }
}
