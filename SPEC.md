<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Phase 1 Spec — acceptance criteria

This file is the **canonical, versioned source of truth** for Phase 1. GitHub
Milestones/Issues mirror it for progress UI; this file is what "done" means.
Check items off as they land.

Global invariants (must hold at every milestone):

- [ ] `npm run typecheck`, `npm run lint`, and `npm run build` all pass.
- [ ] Every source file carries an SPDX header.
- [ ] No raw hex/rgb colour outside `src/styles/tokens.css` and theme files.
- [ ] `src/engine/**` never imports from `src/packs/**` or `src/app/**`
      (enforced by the oxlint boundary rule).

---

## M0 — Scaffold + license + docs

- [x] Vite + React 19 + TypeScript strict project scaffolded.
- [x] Dependencies installed: `@xyflow/react`, `zustand`, `motion`, `nanoid`.
- [x] `src/engine` / `src/packs/cloud` / `src/app` structure with an enforced
      engine import boundary (oxlint override).
- [x] Design tokens (`tokens.css`), reset, global styles; neon-dark default theme.
- [x] License/governance docs: `LICENSE` (AGPL-3.0-only), `COMMERCIAL-LICENSE.md`,
      `CONTRIBUTING.md`, `CLA.md`, `NOTICE`.
- [x] `ROADMAP.md` + this `SPEC.md` written first; marketing-first `README.md`.
- [x] `npm run dev` shows an empty themed canvas; `build`/`typecheck`/`lint` pass.

## M1 — Domain core + registry + cloud-pack subset

- [x] Affordance taxonomy (`emit, consume, store, serve, process, route, cache`).
- [x] `NodeKind`, `Interaction`, `AnimationSpec`, `Pack` types defined in engine.
- [x] `PackRegistry` + `registerPack()`.
- [x] Cloud-pack subset: `service, bucket, queue, worker, db, cdn, origin` kinds
      with affordances, icons, and accent tokens — all as data.
- [x] Registering the cloud pack populates the palette from data; `engine/` has
      zero cloud-specific strings.

## M2 — Canvas + node/edge shells + resolver

- [x] `LDNode` (with a level-bar shell) and `LDEdge` (base path + arrowhead +
      verb-label chip) registered with React Flow; chrome restyled from tokens.
- [x] Affordance/kind-pair resolver with the cloud rules.
- [x] On connect: auto-apply the top candidate + a verb chip to switch verbs.
- [x] Connect a Service → Bucket and the edge auto-labels "upload"; the chip
      lists download/others.

## M3 — AnimationSpec engine (the thesis)

- [x] Interpreter + single-`requestAnimationFrame` scheduler + `SvgPayloadRenderer`
      behind a `PayloadRenderer` interface.
- [x] Node `level` store + fill/drain overlay; global throughput slider.
- [x] Built-in behaviors: travel, accumulate, drain, round-trip (+ reactions
      fill, drain via imperative level). (pulse + emit/flash/absorb polish: later.)
- [x] Specs `cloud.upload.v1`, `cloud.download.v1`, `cloud.query.v1`.
- [x] Service → Bucket fills the bucket (0→100%); Bucket → Service drains it
      (100→0%); Service → DB round-trips; the three read as visibly different.
- [x] The throughput slider retimes every active interaction.
- [x] The animation tick causes **no** React re-render (verified: ~1650 frames,
      1×→3× throughput change, node render count unchanged at 40).
- [x] Reduced motion → static indicator (fill-bar / arrow), no rAF loop.

## M4 — L1 preset inspector

- [ ] Inspector generated from each spec's `exposedParams` via a param-schema
      (`select | slider | color | sprite | toggle`).
- [ ] Edits merge into `interaction.params`; reset-to-default restores.
- [ ] Change sprite, colour, rate, and direction on the upload edge live.

## M5 — Editor + persistence

- [ ] Palette drag-drop, `onConnect`, delete.
- [ ] Debounced localStorage autosave; load on boot.
- [ ] Versioned JSON export/import of `{ version, nodes, interactions, levels? }`;
      export → clear → import round-trips including verbs/specs.

## M6 — Flagship scenes + presentation mode

- [ ] Cloud-pack scenes: CDN cache warm-up, microservices fan-out, OAuth2 flow
      (optional S3 upload→process→store pipeline).
- [ ] Scene picker; presentation bar step-through with captions, animating only
      the current step's interactions (selective storytelling).
- [ ] Marketing GIFs recorded.

## M7 — Deploy + portfolio embed

- [ ] Deploy to `diagrams.vaibhav.co.uk` (deploy-branch → Hostinger + `.htaccess`).
- [ ] `?embed=presentation&scene=<id>` renders a chrome-less presentation.
- [ ] In-app "Source" link (AGPL §13).
- [ ] `codeart.fun` `/diagrams` page embeds the console on desktop, degrades to a
      static poster + CTAs on mobile/reduced-motion; portfolio build unaffected.
