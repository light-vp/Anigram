// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The sheet's stylesheet. It lives inside the <svg> (not in a CSS module) so
 * a downloaded or printed sheet is self-contained: colours come from the
 * custom properties on the root (see palette.ts), fonts fall back to whatever
 * the reader has.
 */
export const SHEET_CSS = `
.sheet { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ln { fill: none; stroke: var(--ink); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.thin { stroke-width: 1.3; }
.body { fill: var(--paper); stroke: var(--ink); stroke-width: 2.2; stroke-linejoin: round; }
.inkf { fill: var(--ink); }
.dashed { stroke-dasharray: 3 4; }
.hatch { fill: none; stroke: var(--muted); stroke-width: 1.2; }
.puff { fill: var(--paper); stroke: var(--muted); stroke-width: 1.2; }
.win { fill: var(--paper); stroke: var(--ink); stroke-width: 1; }
.win.on { fill: var(--lit); }
.glyphText { font: 700 16px system-ui, sans-serif; fill: var(--ink); text-anchor: middle; dominant-baseline: middle; }
.glyphText.small { font-size: 8px; letter-spacing: 0.08em; fill: var(--alarm); }

.bg { fill: var(--paper); }
.gridDot { fill: var(--grid); }
.frame { fill: none; stroke: var(--ink); stroke-width: 2.5; }
.frameThin { fill: none; stroke: var(--ink); stroke-width: 1; }
.zone { font-size: 9px; fill: var(--muted); text-anchor: middle; dominant-baseline: middle; }

.part .hit { fill: transparent; }
.part.clicky .hit, .part.selectable .hit { cursor: pointer; }
.part .ring { fill: none; stroke: var(--ink); stroke-width: 1.2; stroke-dasharray: 4 4; opacity: 0; }
.part.selected .ring { opacity: 1; }
.part:hover .ring { opacity: 0.5; }
.dim { opacity: 0.22; transition: opacity 0.25s; }
.part, .link { transition: opacity 0.25s; }

.labelBg { fill: var(--paper); opacity: 0.9; }
.label, .value { paint-order: stroke; stroke: var(--paper); stroke-width: 4px; stroke-linejoin: round; }
.label { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; fill: var(--ink); text-transform: uppercase; }
.value { font-size: 10.5px; fill: var(--muted); }
.value.bad { fill: var(--alarm); font-weight: 700; }

.rail { fill: none; stroke: var(--ink); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.rail.loss { stroke: var(--muted); stroke-dasharray: 2 5; }
.rail.limit { stroke: var(--alarm); stroke-width: 2.4; }
.pipeOuter { fill: none; stroke: var(--ink); stroke-linejoin: round; }
.pipeInner { fill: none; stroke: var(--paper); stroke-linejoin: round; }
.band { fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: 0.32; }
.flow { fill: none; stroke-linejoin: round; }
.arrow { stroke: var(--paper); stroke-width: 1; }
.tag { font-size: 10px; font-weight: 700; text-anchor: middle; dominant-baseline: middle; }
.tagBg { fill: var(--paper); stroke-width: 1.2; }

.tbLabel { font-size: 7.5px; letter-spacing: 0.12em; fill: var(--muted); text-transform: uppercase; }
.tbTitle { font: 700 22px system-ui, -apple-system, 'Segoe UI', sans-serif; fill: var(--ink); letter-spacing: -0.01em; }
.tbSub { font: 11px system-ui, -apple-system, 'Segoe UI', sans-serif; fill: var(--muted); }
.tbValue { font-size: 15px; font-weight: 700; fill: var(--ink); }
.tbSmall { font-size: 10px; fill: var(--ink); }
`
