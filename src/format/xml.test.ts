// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { kid, kids, parseXml } from './xml.ts'

test('elements, attributes, text and entities', () => {
  const doc = parseXml(`<?xml version="1.0"?>
<!DOCTYPE a [<!ENTITY x "y">]>
<!-- a comment -->
<a k="1 &amp; 2" j='&#x41;&#66;'>
  <b/><b n="2">t &lt;3</b>
  <c><![CDATA[<raw> & such]]></c>
</a>`)
  assert.equal(doc.name, 'a')
  assert.deepEqual(doc.attrs, { k: '1 & 2', j: 'AB' })
  assert.equal(kids(doc, 'b').length, 2)
  assert.equal(kids(doc, 'b')[1]!.text, 't <3')
  assert.equal(kid(doc, 'c')!.text, '<raw> & such')
})

test('a broken file says where', () => {
  assert.throws(() => parseXml('<a>\n<b>\n</a>'), /<\/a> closes <b> \(line 3\)/)
  assert.throws(() => parseXml('<a>'), /never closed/)
  assert.throws(() => parseXml('just text'), /no elements|text after/)
})
