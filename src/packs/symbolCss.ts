// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vaibhav Patel

/** the engineering sheet's extra styles, added only to sheets that need them */
export const SYMBOL_CSS = `
.ln.sym, .sym { fill: var(--paper); }
.mask { fill: var(--paper); stroke: none; }
.ln.inkf { fill: var(--ink); }
.ln.heavy { stroke-width: 3; }
.ln.alarm, .alarmStroke { stroke: var(--alarm); }
.ln.live { stroke: var(--muted); stroke-dasharray: 2 3; }
.lvl { fill: var(--water); opacity: 0.35; stroke: none; }
.lvl.oil { fill: var(--oil); }
.lvl.air { fill: var(--air); }
.lvl.low { fill: var(--alarm); }
.symText { font-size: 13px; font-weight: 600; fill: var(--ink); text-anchor: middle; dominant-baseline: central; }
.symText.small { font-size: 8.5px; font-weight: 500; }
.eng .route { stroke: var(--ink); }
.eng .route.process { stroke-width: 2; }
.eng .route.utility { stroke-width: 1.25; }
.eng .route.signal { stroke-width: 1; stroke-dasharray: 6 4; }
.eng .route.data { stroke-width: 1.6; stroke-dasharray: 0.1 5; }
.eng .route.pneumatic, .eng .route.hydraulic, .eng .route.capillary, .eng .route.electromagnetic { stroke-width: 1; }
.eng .route.idle { stroke: var(--muted); }
.eng .shaft { fill: none; stroke: var(--ink); stroke-width: 4; }
.eng .shaftCore { fill: none; stroke: var(--paper); stroke-width: 2; }
.eng .arrow { fill: var(--ink); }
.eng .arrow.idle { fill: var(--paper); stroke: var(--muted); stroke-width: 1; }
.eng .conn { fill: none; stroke: var(--ink); stroke-width: 1; }
.ln.dashed { stroke-dasharray: 3 2.5; }
.bubbleText { font-size: 9.5px; font-weight: 600; fill: var(--ink); text-anchor: middle; dominant-baseline: central; letter-spacing: 0.02em; }
.eng .tagLabel { font-size: 11.5px; font-weight: 650; fill: var(--ink); letter-spacing: 0.02em; }
.eng .lineNo { font-size: 9.5px; fill: var(--ink); font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--paper); stroke-width: 3px; }

.tbCell { fill: var(--paper); stroke: var(--ink); stroke-width: 0.6; }
.tbFrame { fill: none; stroke: var(--ink); stroke-width: 1.4; }
.tbLabel { font-size: 6.5px; fill: var(--muted); letter-spacing: 0.06em; }
.tbValue { font-size: 9.5px; fill: var(--ink); }
.tbValue.muted { font-size: 8.5px; fill: var(--muted); }
.tbTitle { font-size: 12.5px; font-weight: 600; fill: var(--ink); }
.eng .credit { text-anchor: start; }
`
