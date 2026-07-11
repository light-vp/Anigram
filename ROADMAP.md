<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Roadmap

Anigram grows along **two interleaving axes**. Neither runs to completion
before the other starts — each phase advances both a notch, so no capability is
ever architecturally stranded.

```
AUTHORING LADDER  →  L1 preset params → L2 visual composer → L3 code plugins → PACK MARKETPLACE
CLOUD INTELLIGENCE →  static cloud pack → Terraform/IaC import → live connectors & metrics → premium tier
```

Two joints hold the axes together:

- The **versioned JSON document** (nodes + interactions) is the joint the IaC
  importer plugs into — it emits exactly what the editor saves.
- The **AnimationSpec** is the joint the visual composer and code plugins plug
  into — all three authoring altitudes read and write the same open format.

---

## Phase 1 — The living blueprint (MVP)

_Advances both axes one notch: engine + a cloud-pack subset + L1 authoring._

- Affordance-driven node model and the typed **Interaction** atom.
- The default-link resolver (semantic defaults, one click from overrides).
- The declarative **AnimationSpec** engine + single-rAF animation overlay, with a
  handful of built-in behaviors (travel, accumulate, drain, round-trip, pulse).
- Three flagship semantic animations proving the thesis: **upload**, **download**,
  **query** — visibly different, auto-resolved from node types.
- **L1 authoring**: a per-interaction inspector exposing preset params.
- Small editor (drag / connect / delete), localStorage persistence, versioned
  JSON import/export.
- Curated cloud scenes + presentation mode.
- Served at `vaibhav.co.uk/anigram-app/` by the portfolio's deploy pipeline;
  embedded in the portfolio's `/anigram` brief page.

See [SPEC.md](SPEC.md) for the tracked Phase-1 acceptance criteria.

## Phase 1.5 — Compose & extend (data-only)

- **L2 visual composer**: build an AnimationSpec from primitives (pick payload →
  chain behaviors → attach reactions → live preview → save as a reusable preset).
- **Data-only community packs** — new node kinds, rules, sprites, and presets with
  zero code execution (zero security surface).

## Phase 2 — Architecture-as-Code & plugins

- **Terraform / CloudFormation import** → auto-layout nodes and edges from real
  resource relationships (emits the same versioned JSON the editor saves).
- **L3 code plugin API** — custom behaviors/renderers run in a **QuickJS-WASM
  sandbox** (no DOM, no network, contained loops). Never on the main thread.

## Phase 3 — Live & enterprise

- **Live connectors** — read-only cloud credentials scan an environment and
  populate the canvas.
- **Live metrics** — the diagram reacts to reality: a node vibrates at high CPU,
  edges flash red on 5XX.
- **Collaboration**, **secure embeds** (Notion/Confluence), a **CI/CD GitHub
  Action** that regenerates the animated diagram on infra change.
- **Pack marketplace** — buy/sell packs, including live-metric-driven premium
  packs.

### Monetization (rides Phase 3)

- **Free** — unlimited basic shapes, manual connections, standard animations.
- **Pro** ($19–29/mo) — high-res interactive embeds/GIF export, unlimited
  diagrams, custom icon/theme uploads.
- **Team / Enterprise** ($99+/mo) — live sync, collaboration, security-policy
  visualization, CI/CD integration.
