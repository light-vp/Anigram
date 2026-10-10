// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The scene format's version, and the steps that bring an older file up to
 * date. Every scene file and share link carries `"anigram": <version>`; a file
 * from before versioning has none and is read as version 1. A link shared
 * today is a promise, so when the format changes the old shape is never
 * rejected — a step here rewrites it into the new one before validation.
 *
 * To change the format: bump FORMAT_VERSION, add a step keyed by the version
 * it upgrades *from*, and add a test that an old file still loads.
 */

/** the version this build writes, and the newest it can read */
export const FORMAT_VERSION = 1

/** the top-level field that carries it */
export const VERSION_KEY = 'anigram'

type Obj = Record<string, unknown>

/** step N takes a version-N scene and returns a version-(N+1) one */
const STEPS: Record<number, (scene: Obj) => Obj> = {}

export interface Migration {
  /** the scene at FORMAT_VERSION, when it could be read */
  scene?: unknown
  /** the version the input said it was */
  from?: number
  error?: string
}

/**
 * Bring a raw scene up to FORMAT_VERSION. Anything that isn't an object is
 * passed through for the validator to reject with its usual message.
 */
export function migrate(input: unknown): Migration {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return { scene: input }
  const raw = input as Obj
  const given = raw[VERSION_KEY]
  const from = given === undefined ? 1 : given
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1)
    return {
      error: `${VERSION_KEY}: the format version must be a whole number from 1, like ${FORMAT_VERSION}`,
    }
  if (from > FORMAT_VERSION)
    return {
      from,
      error:
        `${VERSION_KEY}: this scene is format ${from}, made by a newer Anigram; ` +
        `this one reads up to format ${FORMAT_VERSION}`,
    }
  let scene = raw
  for (let v = from; v < FORMAT_VERSION; v++) {
    const step = STEPS[v]
    if (!step) throw new Error(`no migration from scene format ${v}`)
    scene = step(scene)
  }
  return { scene: stamp(scene), from }
}

/** a scene as it goes into a file or a link: version first, then the rest */
export function stamp<T extends object>(scene: T): T & { anigram: number } {
  // assigning an existing key keeps its place, so the version stays first
  return Object.assign({ anigram: FORMAT_VERSION }, scene, {
    anigram: FORMAT_VERSION,
  })
}
