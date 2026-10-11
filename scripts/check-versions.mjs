// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

// One version for the app, the npm package and the repo, and a changelog
// entry for it. CI runs this; so does the publish workflow, before it stages.
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const app = JSON.parse(read('package.json')).version
const mcp = JSON.parse(read('mcp/package.json')).version
const changelog = read('CHANGELOG.md')

const problems = []
if (app !== mcp)
  problems.push(
    `package.json is ${app} but mcp/package.json is ${mcp}: bump them together`,
  )
if (!new RegExp(`^## ${mcp.replace(/\./g, '\\.')}$`, 'm').test(changelog))
  problems.push(`CHANGELOG.md has no "## ${mcp}" section`)

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`version ${mcp}: app, package and changelog agree`)
