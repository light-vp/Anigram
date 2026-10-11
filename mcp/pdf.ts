// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The sheet as a one-page PDF on ISO A paper, for printing and filing. The
 * drawing is rendered at 300 dpi by the same renderer as the PNG and placed
 * on the page with 10 mm margins, so a print matches what the assistant
 * saw. The file is written by hand: one page, one image, no dependencies.
 */

import { deflateSync } from 'node:zlib'

import { svgToPixels } from './png.ts'

/** ISO 216 sizes in millimetres, landscape */
export const PAPER = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
} as const

export type Paper = keyof typeof PAPER

const MARGIN_MM = 10
const DPI = 300
const PT_PER_MM = 72 / 25.4

export interface PdfInfo {
  title: string
  author?: string
  subject?: string
}

/** a PDF string literal, with the characters PDF treats specially escaped */
function pdfString(s: string): string {
  // non-Latin-1 text goes as UTF-16BE with a byte-order mark
  if (/[^\x20-\x7e]/.test(s)) {
    const units = [
      0xfeff,
      ...[...s].flatMap((c) => {
        const cp = c.codePointAt(0)!
        if (cp < 0x10000) return [cp]
        const v = cp - 0x10000
        return [0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)]
      }),
    ]
    return `<${units.map((u) => u.toString(16).padStart(4, '0')).join('')}>`
  }
  return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`
}

/** the sheet's SVG, `aspect` wide to 1 high, as PDF bytes on `paper` */
export async function svgToPdf(
  svg: string,
  aspect: number,
  paper: Paper,
  info: PdfInfo,
): Promise<{ pdf: Uint8Array; width: number; height: number }> {
  const [pw, ph] = PAPER[paper]
  // the largest box of the sheet's shape inside the margins
  const room = [pw - 2 * MARGIN_MM, ph - 2 * MARGIN_MM] as const
  const fitW = Math.min(room[0], room[1] * aspect)
  const fitH = fitW / aspect
  const px = Math.round((fitW / 25.4) * DPI)
  const img = await svgToPixels(svg, px)

  // drop the alpha: the sheet paints its own background, so it is opaque
  const rgb = new Uint8Array(img.width * img.height * 3)
  for (let i = 0, j = 0; i < img.rgba.length; i += 4, j += 3) {
    rgb[j] = img.rgba[i]!
    rgb[j + 1] = img.rgba[i + 1]!
    rgb[j + 2] = img.rgba[i + 2]!
  }
  const pixels = deflateSync(rgb, { level: 9 })

  const W = pw * PT_PER_MM
  const H = ph * PT_PER_MM
  const dw = fitW * PT_PER_MM
  const dh = fitH * PT_PER_MM
  const dx = (W - dw) / 2
  const dy = (H - dh) / 2
  const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q\n`

  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const put = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b
    chunks.push(bytes)
    length += bytes.length
  }
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = length
    put(`${n} 0 obj\n${body}\n`)
    if (stream) {
      put('stream\n')
      put(stream)
      put('\nendstream\n')
    }
    put('endobj\n')
  }

  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  )
  obj(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>`,
    pixels,
  )
  obj(5, `<< /Length ${enc.encode(content).length} >>`, enc.encode(content))
  const meta = [
    `/Title ${pdfString(info.title)}`,
    info.author && `/Author ${pdfString(info.author)}`,
    info.subject && `/Subject ${pdfString(info.subject)}`,
    `/Creator ${pdfString('Anigram')}`,
    `/Producer ${pdfString('anigram-mcp')}`,
  ].filter(Boolean)
  obj(6, `<< ${meta.join(' ')} >>`)

  const xref = length
  put(`xref\n0 7\n0000000000 65535 f \n`)
  for (let n = 1; n <= 6; n++)
    put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  put(
    `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  )

  const pdf = new Uint8Array(length)
  let at = 0
  for (const c of chunks) {
    pdf.set(c, at)
    at += c.length
  }
  return { pdf, width: img.width, height: img.height }
}
