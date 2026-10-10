// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

import { PART_KINDS } from '../parts/kinds.ts'
import { MAX_EXPR_LENGTH } from '../sim/expr.ts'
import { FORMAT_VERSION } from './migrate.ts'
import { DOMAINS, FIELDS, ROLES } from './validate.ts'

/*
 * The scene format as a JSON Schema, so editors can check and autocomplete a
 * scene file and other tools can read the format without reading this code.
 * Built from the validator's own field lists, so the two can't drift; the
 * validator stays the authority on what the schema can't say (ids that must
 * match, expressions that must parse, the network making sense).
 *
 * `npm run schema` writes it to schema/; a test fails if the file is stale.
 */

export const SCHEMA_URL = `https://raw.githubusercontent.com/light-vp/Anigram/main/schema/scene.v${FORMAT_VERSION}.json`

type Schema = Record<string, unknown>

const num: Schema = { type: 'number' }
const str: Schema = { type: 'string', minLength: 1 }
const cell: Schema = {
  type: 'array',
  items: num,
  minItems: 2,
  maxItems: 2,
  description: '[column, row] on the grid, zero-based',
}
const domain: Schema = { enum: [...DOMAINS] }
const signal: Schema = {
  description:
    'a number, or an expression of the hour and the controls, like "32 * sun(hour) * (1 - 0.85 * knob(\'cloud\'))"',
  anyOf: [num, { type: 'string', minLength: 1, maxLength: MAX_EXPR_LENGTH }],
}
const byDomain = (value: Schema): Schema => ({
  type: 'object',
  propertyNames: domain,
  additionalProperties: value,
})

/** an object with exactly these fields, the listed ones required */
function object(
  fields: readonly string[],
  properties: Record<string, Schema>,
  required: string[] = [],
): Schema {
  for (const f of Object.keys(properties))
    if (!fields.includes(f)) throw new Error(`schema: "${f}" is not in FIELDS`)
  for (const f of fields)
    if (!(f in properties)) throw new Error(`schema: no property for "${f}"`)
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

const behaviours: Record<(typeof ROLES)[number], Schema> = {
  source: object(
    FIELDS.source,
    {
      role: { const: 'source' },
      output: signal,
      dispatchable: { type: 'boolean' },
      merit: num,
    },
    ['role', 'output'],
  ),
  sink: object(
    FIELDS.sink,
    {
      role: { const: 'sink' },
      demand: signal,
      priority: num,
      absorbsSurplus: { type: 'boolean' },
    },
    ['role', 'demand'],
  ),
  bus: object(FIELDS.bus, { role: { const: 'bus' } }, ['role']),
  gate: object(
    FIELDS.gate,
    { role: { const: 'gate' }, capacity: { ...num, minimum: 0 }, open: signal },
    ['role', 'capacity'],
  ),
  converter: object(
    FIELDS.converter,
    {
      role: { const: 'converter' },
      output: domain,
      recipe: {
        ...byDomain({ ...num, exclusiveMinimum: 0 }),
        minProperties: 1,
        description: 'how much of each input one unit of output takes',
      },
      capacity: { ...num, minimum: 0 },
      startup: { ...num, minimum: 0 },
    },
    ['role', 'output', 'recipe'],
  ),
  storage: object(
    FIELDS.storage,
    {
      role: { const: 'storage' },
      capacity: { ...num, exclusiveMinimum: 0 },
      start: { ...num, minimum: 0, maximum: 1 },
      maxIn: signal,
      maxOut: signal,
      efficiency: { ...num, minimum: 0, maximum: 1 },
      merit: num,
      refill: object(
        FIELDS.refill,
        {
          below: { ...num, minimum: 0, maximum: 1 },
          until: { ...num, minimum: 0, maximum: 1 },
        },
        ['below', 'until'],
      ),
    },
    ['role', 'capacity', 'maxIn', 'maxOut'],
  ),
  vent: object(FIELDS.vent, { role: { const: 'vent' } }, ['role']),
}

export function sceneSchema(): Schema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SCHEMA_URL,
    title: 'Anigram scene',
    description: `A living diagram: parts on a grid, the links between them, and the signals that drive them. Format version ${FORMAT_VERSION}.`,
    ...object(
      FIELDS.scene,
      {
        $schema: { type: 'string' },
        anigram: {
          const: FORMAT_VERSION,
          description: 'the format version this file is written in',
        },
        id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
        title: str,
        subtitle: { type: 'string' },
        sheet: { type: 'string', description: 'drawing number, like LD-101' },
        size: {
          type: 'array',
          items: { type: 'integer', minimum: 1, maximum: 40 },
          minItems: 2,
          maxItems: 2,
          description: 'grid columns × rows',
        },
        units: byDomain(
          object(FIELDS.units, { rate: str, amount: str }, ['rate', 'amount']),
        ),
        scale: byDomain({ ...num, exclusiveMinimum: 0 }),
        parts: {
          type: 'array',
          minItems: 1,
          items: object(
            FIELDS.part,
            {
              id: str,
              kind: {
                type: 'string',
                minLength: 1,
                description: 'which drawing to use',
                examples: Object.keys(PART_KINDS),
              },
              label: str,
              at: cell,
              behaviour: { oneOf: Object.values(behaviours) },
              note: { type: 'string' },
              labelSide: { enum: ['below', 'above', 'left', 'right'] },
              toggles: { type: 'string', description: 'a switch id' },
            },
            ['id', 'kind', 'label', 'at', 'behaviour'],
          ),
        },
        links: {
          type: 'array',
          items: object(
            FIELDS.link,
            {
              from: str,
              to: str,
              domain,
              capacity: { ...num, minimum: 0 },
              via: { type: 'array', items: cell },
              bend: { enum: ['hv', 'vh'] },
              loss: { type: 'boolean' },
            },
            ['from', 'to', 'domain'],
          ),
        },
        knobs: {
          type: 'array',
          items: object(
            FIELDS.knob,
            {
              id: str,
              label: str,
              min: num,
              max: num,
              step: num,
              value: num,
              format: {
                type: 'string',
                description:
                  '{pct} is the value as a percentage, {value} the number',
              },
            },
            ['id', 'label', 'value'],
          ),
        },
        switches: {
          type: 'array',
          items: object(
            FIELDS.switch,
            { id: str, label: str, on: { type: 'boolean' } },
            ['id', 'label', 'on'],
          ),
        },
        captions: {
          type: 'array',
          items: object(
            FIELDS.caption,
            {
              from: { ...num, minimum: 0, maximum: 24 },
              to: { ...num, minimum: 0, maximum: 24 },
              text: str,
            },
            ['from', 'to', 'text'],
          ),
        },
        clock: object(FIELDS.clock, {
          start: { ...num, minimum: 0, maximum: 24 },
          rate: { ...num, minimum: 0.01, maximum: 24 },
        }),
      },
      ['id', 'title', 'size', 'parts', 'links'],
    ),
  }
}
