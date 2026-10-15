// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/*
 * The sheet's stylesheet. It lives inside the <svg> (not in a CSS module) so
 * a downloaded or printed sheet is self-contained: colours come from the
 * custom properties on the root (see palette.ts), fonts fall back to whatever
 * the reader has.
 */
export const SHEET_CSS = `
.sheet { font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.ln { fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
.ln.thin, .thin { stroke-width: 1; }
.ln.solid { fill: var(--tile); }
.inkf { fill: var(--ink); }
.puff { fill: none; stroke: var(--muted); stroke-width: 1; }
.win { fill: none; stroke: var(--ink); stroke-width: 0.9; }
.win.on { fill: var(--lit); stroke: var(--lit); }
.bar { fill: var(--paper); stroke: var(--ink); stroke-width: 1.5; }
.glyphText { font-size: 12px; font-weight: 600; fill: var(--ink); text-anchor: middle; dominant-baseline: central; }
.glyphText.small { font-size: 8.5px; }

.bg { fill: var(--paper); }

.part .tile { fill: var(--tile); stroke: var(--line); stroke-width: 1; transition: stroke 0.2s; }
.part.bad .tile { stroke: var(--alarm); }
.part:hover .tile { stroke: var(--muted); }
.part.selected .tile { stroke: var(--ink); stroke-width: 1.5; }
.part .hit { fill: transparent; }
.part.selectable .hit { cursor: pointer; }
.dim { opacity: 0.18; }
.part, .link, .tagGroup, .labelGroup { transition: opacity 0.25s; }

.label, .value, .tag { paint-order: stroke; stroke: var(--paper); stroke-width: 4px; stroke-linejoin: round; }
.label { font-size: 11.5px; font-weight: 550; fill: var(--ink); }
.value { font-size: 10.5px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.value.bad { fill: var(--alarm); }
.chainArrow { fill: none; stroke: var(--muted); stroke-width: 1.25; stroke-dasharray: 3 4; opacity: 0.55; }
.chainArrow.live { stroke: var(--lit); opacity: 1; stroke-dasharray: none; stroke-width: 1.75; }
.chainRing { fill: none; stroke: var(--lit); stroke-width: 2; }

.route { fill: none; stroke: var(--line); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.route.loss { stroke-dasharray: 1 5; stroke-width: 1.5; stroke: var(--muted); opacity: 0.6; }
.route.limit { stroke: var(--alarm); }
.stream { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.chev { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.tag { font-size: 10px; fill: var(--muted); text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; }

.title { font-size: 20px; font-weight: 600; letter-spacing: -0.015em; fill: var(--ink); }
.sub { font-size: 12.5px; fill: var(--muted); }
.clock { font-size: 20px; font-weight: 500; fill: var(--ink); text-anchor: end; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.meta { font-size: 11px; fill: var(--muted); text-anchor: end; letter-spacing: 0.02em; }
.legend { font-size: 11px; fill: var(--muted); dominant-baseline: central; }
.credit { font-size: 10px; fill: var(--muted); text-anchor: end; letter-spacing: 0.02em; }
.rule { stroke: var(--line); stroke-width: 1; }
`
