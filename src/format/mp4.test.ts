// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Mp4Muxer } from './mp4.ts'

/*
 * A small box parser, enough to walk the tree the muxer writes and read
 * the sample tables back out of it.
 */
interface Box {
  type: string
  start: number
  size: number
  body: Uint8Array
  kids: Box[]
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'dinf', 'stbl'])

function parse(buf: Uint8Array, start = 0, end = buf.length): Box[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out: Box[] = []
  let at = start
  while (at < end) {
    const size = view.getUint32(at)
    assert.ok(size >= 8 && at + size <= end, `box at ${at} has size ${size}`)
    const type = String.fromCharCode(...buf.subarray(at + 4, at + 8))
    const body = buf.subarray(at + 8, at + size)
    const kids = CONTAINERS.has(type) ? parse(buf, at + 8, at + size) : []
    out.push({ type, start: at, size, body, kids })
    at += size
  }
  assert.equal(at, end)
  return out
}

function find(boxes: Box[], path: string): Box {
  let cur: Box | undefined
  let level = boxes
  for (const type of path.split('/')) {
    cur = level.find((b) => b.type === type)
    assert.ok(cur, `no ${path}`)
    level = cur.kids
  }
  return cur!
}

const u32 = (b: Uint8Array, at: number) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at)

/** a full box's table, after version/flags and the entry count */
function entries(b: Box, width = 1) {
  const n = u32(b.body, 4)
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const row: number[] = []
    for (let k = 0; k < width; k++)
      row.push(u32(b.body, 8 + (i * width + k) * 4))
    out.push(row)
  }
  assert.equal(b.body.length, 8 + n * width * 4, `${b.type} length`)
  return out
}

/** stand-in AVCC samples: a 4-byte length then that many marked bytes */
function sample(i: number, size: number) {
  const data = new Uint8Array(size)
  new DataView(data.buffer).setUint32(0, size - 4)
  data.fill(i & 0xff, 4)
  return data
}

const AVCC = Uint8Array.from([
  1, 0x42, 0xe0, 0x1f, 0xff, 0xe1, 0, 4, 0x67, 0x42, 0xe0, 0x1f, 1, 0, 2, 0x68,
  0xce,
])

test('the box tree, sample tables and offsets', () => {
  const mux = new Mp4Muxer({ width: 640, height: 360 })
  mux.setConfig(AVCC)
  const sizes = [900, 120, 130, 140, 800, 110, 115]
  // 30 fps in microseconds, as WebCodecs rounds them
  sizes.forEach((size, i) => {
    mux.add({
      data: sample(i, size),
      timestamp: Math.round((i * 1e6) / 30),
      duration: 33333,
      key: i % 4 === 0,
    })
  })
  const file = mux.finish()
  const top = parse(file)
  assert.deepEqual(
    top.map((b) => b.type),
    ['ftyp', 'moov', 'mdat'],
  )

  const ftyp = top[0]!.body
  assert.equal(String.fromCharCode(...ftyp.subarray(0, 4)), 'isom')
  assert.equal(String.fromCharCode(...ftyp.subarray(8)), 'isomiso2avc1mp41')

  const trak = find(top, 'moov/trak')
  assert.deepEqual(
    trak.kids.map((b) => b.type),
    ['tkhd', 'mdia'],
  )
  assert.deepEqual(
    find(top, 'moov/trak/mdia/minf/stbl').kids.map((b) => b.type),
    ['stsd', 'stts', 'stss', 'stsc', 'stsz', 'stco'],
  )

  // durations: 7 frames at 3000 ticks of 90 kHz
  const mvhd = find(top, 'moov/mvhd').body
  const tkhd = find(top, 'moov/trak/tkhd').body
  const mdhd = find(top, 'moov/trak/mdia/mdhd').body
  assert.equal(u32(mvhd, 12), 90000)
  assert.equal(u32(mvhd, 16), 7 * 3000)
  assert.equal(u32(mdhd, 12), 90000)
  assert.equal(u32(mdhd, 16), 7 * 3000)
  assert.equal(u32(tkhd, 0) & 0xffffff, 3, 'enabled, in movie')
  assert.equal(u32(tkhd, 20), 7 * 3000)
  assert.equal(u32(tkhd, 76), 640 << 16)
  assert.equal(u32(tkhd, 80), 360 << 16)
  // 'und'
  assert.equal(new DataView(mdhd.buffer, mdhd.byteOffset).getUint16(20), 0x55c4)
  const hdlr = find(top, 'moov/trak/mdia/hdlr').body
  assert.equal(String.fromCharCode(...hdlr.subarray(8, 12)), 'vide')

  const stbl = 'moov/trak/mdia/minf/stbl/'
  const stts = entries(find(top, stbl + 'stts'), 2)
  assert.deepEqual(stts, [[7, 3000]])
  assert.equal(
    stts.reduce((s, [n, d]) => s + n! * d!, 0),
    u32(mdhd, 16),
  )
  assert.deepEqual(entries(find(top, stbl + 'stss')).flat(), [1, 5])
  assert.deepEqual(entries(find(top, stbl + 'stsc'), 3), [[1, 7, 1]])
  const stsz = find(top, stbl + 'stsz')
  assert.equal(u32(stsz.body, 4), 0)
  assert.equal(u32(stsz.body, 8), 7)
  const got = sizes.map((_, i) => u32(stsz.body, 12 + i * 4))
  assert.deepEqual(got, sizes)

  // the chunk offset lands on the first sample, and the rest follow it
  const offset = entries(find(top, stbl + 'stco'))[0]![0]!
  const mdat = top[2]!
  assert.equal(offset, mdat.start + 8)
  let at = offset
  sizes.forEach((size, i) => {
    assert.equal(u32(file, at), size - 4)
    assert.equal(file[at + 4], i)
    assert.equal(file[at + size - 1], i)
    at += size
  })
  assert.equal(at, file.length)

  // the avc1 entry carries the avcC record byte for byte
  const stsd = find(top, stbl + 'stsd')
  assert.equal(u32(stsd.body, 4), 1)
  const [avc1] = parse(stsd.body, 8)
  assert.equal(avc1!.type, 'avc1')
  const e = avc1!.body
  assert.equal((e[24]! << 8) | e[25]!, 640)
  assert.equal((e[26]! << 8) | e[27]!, 360)
  assert.equal(u32(e, 28), 0x480000)
  assert.equal((e[74]! << 8) | e[75]!, 0x18)
  assert.equal((e[76]! << 8) | e[77]!, 0xffff)
  const [avcC] = parse(e, 78)
  assert.equal(avcC!.type, 'avcC')
  assert.deepEqual([...avcC!.body], [...AVCC])
})

test('uneven timestamps keep their total and a fresh start at zero', () => {
  const mux = new Mp4Muxer({ width: 2, height: 2, timescale: 1000 })
  mux.setConfig(AVCC)
  // starts late, with a hiccup and a long last frame
  const times = [5_000_000, 5_040_000, 5_080_000, 5_200_000]
  times.forEach((timestamp, i) => {
    mux.add({
      data: sample(i, 10),
      timestamp,
      duration: i === 3 ? 500_000 : 40_000,
      key: i === 0,
    })
  })
  const top = parse(mux.finish())
  const stts = entries(find(top, 'moov/trak/mdia/minf/stbl/stts'), 2)
  assert.deepEqual(stts, [
    [2, 40],
    [1, 120],
    [1, 500],
  ])
  assert.equal(u32(find(top, 'moov/mvhd').body, 16), 700)
  assert.deepEqual(
    entries(find(top, 'moov/trak/mdia/minf/stbl/stss')).flat(),
    [1],
  )
})

test('the muxer says what is missing or out of order', () => {
  assert.throws(() => new Mp4Muxer({ width: 0, height: 2 }), /width/)
  const mux = new Mp4Muxer({ width: 2, height: 2 })
  assert.throws(() => mux.setConfig(Uint8Array.of(0, 0, 0, 1)), /avcC/)
  assert.throws(
    () =>
      mux.add({ data: sample(0, 8), timestamp: 0, duration: 1, key: false }),
    /key frame/,
  )
  mux.add({ data: sample(0, 8), timestamp: 100, duration: 1, key: true })
  assert.throws(
    () =>
      mux.add({ data: sample(1, 8), timestamp: 50, duration: 1, key: false }),
    /presentation order/,
  )
  assert.throws(() => mux.finish(), /setConfig/)
})
