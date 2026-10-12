// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * Just enough XML to read the files plant software writes: elements,
 * attributes, text, comments, CDATA and the five named entities plus
 * numeric ones. No DTDs, no namespaces beyond keeping the prefix in the
 * name. Runs the same in the browser and in node, where there is no
 * DOMParser.
 */

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

export class XmlError extends Error {
  readonly at: number
  constructor(message: string, at: number) {
    super(message)
    this.at = at
  }
}

const NAMED: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

function decode(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10),
      )
    return NAMED[e] ?? m
  })
}

/** the document's root element */
export function parseXml(src: string): XmlNode {
  let i = 0
  const stack: XmlNode[] = []
  let root: XmlNode | undefined
  const fail = (msg: string): never => {
    const line = src.slice(0, i).split('\n').length
    throw new XmlError(`${msg} (line ${line})`, i)
  }
  const skipTo = (end: string) => {
    const j = src.indexOf(end, i)
    if (j < 0) fail(`no closing ${end}`)
    const out = src.slice(i, j)
    i = j + end.length
    return out
  }

  while (i < src.length) {
    const lt = src.indexOf('<', i)
    const top = stack.at(-1)
    if (lt < 0) {
      if (src.slice(i).trim()) fail('text after the last element')
      break
    }
    if (lt > i && top) top.text += decode(src.slice(i, lt))
    i = lt
    if (src.startsWith('<!--', i)) {
      i += 4
      skipTo('-->')
    } else if (src.startsWith('<![CDATA[', i)) {
      i += 9
      const t = skipTo(']]>')
      if (top) top.text += t
    } else if (src.startsWith('<?', i)) {
      i += 2
      skipTo('?>')
    } else if (src.startsWith('<!', i)) {
      // a DOCTYPE, perhaps with an internal subset in brackets
      let depth = 0
      for (; i < src.length; i++) {
        const c = src[i]
        if (c === '[') depth++
        else if (c === ']') depth--
        else if (c === '>' && depth <= 0) break
      }
      i++
    } else if (src[i + 1] === '/') {
      const end = src.indexOf('>', i)
      if (end < 0) fail('an unclosed end tag')
      const name = src.slice(i + 2, end).trim()
      const open = stack.pop()
      if (!open) fail(`</${name}> closes nothing`)
      if (open!.name !== name) fail(`</${name}> closes <${open!.name}>`)
      i = end + 1
    } else {
      i++
      const m = /^[^\s/>]+/.exec(src.slice(i, i + 256))
      if (!m) fail('an element with no name')
      const node: XmlNode = { name: m![0], attrs: {}, children: [], text: '' }
      i += m![0].length
      // attributes, up to > or />
      for (;;) {
        while (/\s/.test(src[i] ?? '')) i++
        if (i >= src.length) fail(`<${node.name}> never ends`)
        if (src[i] === '>' || src.startsWith('/>', i)) break
        const a = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(
          src.slice(i, i + 64 * 1024),
        )
        if (!a) fail(`a malformed attribute on <${node.name}>`)
        node.attrs[a![1]!] = decode(a![3] ?? a![4] ?? '')
        i += a![0].length
      }
      const selfClosing = src[i] === '/'
      i += selfClosing ? 2 : 1
      if (top) top.children.push(node)
      else if (root) fail('a second root element')
      else root = node
      if (!selfClosing) stack.push(node)
    }
  }
  if (stack.length) fail(`<${stack.at(-1)!.name}> is never closed`)
  if (!root) fail('no elements')
  return root!
}

/** the direct children with this name */
export const kids = (n: XmlNode, name: string) =>
  n.children.filter((c) => c.name === name)

/** the first direct child with this name */
export const kid = (n: XmlNode, name: string) =>
  n.children.find((c) => c.name === name)

/** every element below `n` (not `n` itself), depth first */
export function* descendants(n: XmlNode): Generator<XmlNode> {
  for (const c of n.children) {
    yield c
    yield* descendants(c)
  }
}
