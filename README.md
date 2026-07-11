<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Anigram

**Architecture diagrams that come alive.** Services don't just _connect_ — they
_interact_, and you see the interaction. A service uploading to a storage bucket
shows files streaming up the wire and filling the bucket; another service
downloading drains them back out. The animation isn't decoration — **the
animation is the meaning.**

<!-- HERO GIF: pulses/files flowing through a microservices scene -->
<p align="center"><em>▶ hero animation — coming soon</em></p>

> Anigram is a general **"living systems map" engine** with a flagship
> **cloud-architecture** pack. It is the first diagramming tool where connections
> carry _semantic, data-driven_ animation.

---

## Why it's different

Existing tools stop at a static picture. draw.io can animate a generic particle
along a line, but it means nothing. Structurizr animates for manual storytelling.
IcePanel/C4 is semantic but frozen. Cloudcraft and Hava are static or
change-diffs. **None bind the animation to what the edge actually _does_.**

Anigram does. Connect two typed nodes and it resolves the _right_
interaction automatically (a service → a bucket is an **upload**; a bucket → a
service is a **download**) — then you can override it to anything.

## Features

- **Semantic connections** — nodes have real types with _affordances_; wiring two
  together resolves a meaningful default interaction, one click from alternatives.
- **The animation is the meaning** — files accumulate, buckets fill, queries
  round-trip, queues drain. Distinct verbs read as distinctly different motion.
- **Author your own** — a phased flexibility ladder: tweak preset params now, a
  visual composer and a plugin API next. All converge on one open JSON format.
- **A throughput slider** retimes the whole map at once.
- **Presentation mode** steps through a request path, lighting the system up
  layer by layer — the best way to explain an architecture.
- **Reduced-motion first** — every interaction degrades to a legible static
  indicator.

<!-- DEMO GIF: OAuth2 presentation-mode step-through -->
<p align="center"><em>▶ demo — OAuth2 request path — coming soon</em></p>

## Quick start

```sh
npm install
npm run dev        # vite dev server
npm run build      # tsc -b && vite build → dist/
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm run format     # prettier --write .
```

## Architecture (one paragraph)

A domain-agnostic **engine** (`src/engine`) owns affordances, the default-link
resolver, the declarative **AnimationSpec** interpreter, a single-`requestAnimationFrame`
animation overlay decoupled from React, the stores, and the editor. A **pack**
(`src/packs/cloud`) supplies everything domain-specific — node kinds, resolver
rules, sprites, animation presets, icons, and curated scenes — as data via
`registerPack()`. The **app** (`src/app`) wires it together. This split is what
lets the catalog grow. See [ROADMAP.md](ROADMAP.md) and [SPEC.md](SPEC.md).

## Scenes

<!-- SCENE GIF: CDN cache warm-up -->

- **CDN cache warm-up** — hit/miss + origin fallback (drag the throughput slider).
- **Microservices fan-out** — an API gateway publishes to queues, workers consume,
  a service uploads to a bucket — distinct verbs side by side.
- **OAuth2 authorization code flow** — a scripted step-through in presentation mode.

## Roadmap

Two interleaving axes — an **authoring ladder** (preset params → visual composer →
code plugins → marketplace) and a **cloud-intelligence** axis (static pack →
Terraform/IaC import → live connectors & metrics). Full detail in
[ROADMAP.md](ROADMAP.md).

## License

Anigram is **dual-licensed**:

- **[AGPL-3.0-only](LICENSE)** — free for open-source and personal use. If you run
  a modified version over a network, you must offer users its source (AGPL §13).
- **[Commercial license](COMMERCIAL-LICENSE.md)** — for embedding in closed-source
  or commercial products without AGPL's copyleft/network-source obligations.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). A signed
**[CLA](CLA.md)** is required so the project can offer the commercial license.

## Trademarks

Anigram is an independent project, **not affiliated with or endorsed by**
Amazon Web Services, Google, or Microsoft. All product names, logos, and brands
are property of their respective owners; provider names are used nominatively to
describe compatibility only. All icons shipped in this repo are original works.
See [NOTICE](NOTICE).
