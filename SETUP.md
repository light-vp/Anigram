<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Deploy setup — served at vaibhav.co.uk/anigram-app/

Anigram has **no hosting of its own**. The portfolio repo
(`light-vp/codeart.fun`) deploys it: its GitHub Action checks out this repo's
`main` branch, builds it with `--base=/anigram-app/`, folds the output into the
site's `dist/anigram-app/`, and Hostinger serves the whole thing at
`vaibhav.co.uk`. This repo's own workflow (`.github/workflows/ci.yml`) is CI
only — typecheck, lint, and both build variants — with a read-only token.

## Releasing a change

1. PR → merge to `main` here (CI must be green).
2. Trigger a portfolio deploy: either merge anything to `codeart.fun`'s `main`,
   or run its **Deploy to Hostinger** workflow manually (Actions →
   Deploy to Hostinger → Run workflow). The next deploy always picks up this
   repo's latest `main`.

## URLs

- `https://vaibhav.co.uk/anigram-app/` — the full editor (standalone).
- `https://vaibhav.co.uk/anigram-app/?embed=app` — the playable editor without
  the header bar (what the portfolio's playground iframe loads).
- `https://vaibhav.co.uk/anigram-app/?embed=presentation&scene=<id>` — the
  chrome-less presentation embeds (scenes: `cdn`, `microservices`, `oauth2`).
- The portfolio's brief page lives at `https://vaibhav.co.uk/anigram`.

Notes: the portfolio's deploy strips this repo's `public/.htaccess` (its SPA
rewrite is root-relative and unnecessary — embeds address the app by query
string only) and writes a minimal `.htaccess` into `dist/anigram-app/` that
sets `Content-Security-Policy: frame-ancestors` so only vaibhav.co.uk can
frame the app. The in-app **"source"** link must keep pointing at the public
repo (AGPL §13).

## Rename checklist (Living Diagrams → Anigram, manual)

The code and docs already say **Anigram**. One identifier is deliberately
still on the old name:

- **GitHub repo slug** — currently `light-vp/living-diagrams` (matching
  `REPO_URL` in `src/engine/canvas/SourceLink.tsx`). If you rename the repo to
  `anigram`, GitHub 301-redirects the old URLs, but update `REPO_URL` and the
  portfolio workflow's `repository: light-vp/living-diagrams` checkout to the
  new slug in the same change.

Saved diagrams migrate automatically: on first load the app copies the old
`living-diagrams:doc` localStorage key to `anigram:doc`. (Note: with the app
now served under `vaibhav.co.uk`, browser storage lives on that origin.)

## Fallback

If serving under the main site ever becomes a problem, the app can be given
its own subdomain again: restore a deploy workflow like `codeart.fun`'s
(build → push `dist/` to a `deploy` branch, SHA-pinned publish action,
`persist-credentials: false`), create the subdomain in Hostinger hPanel →
Git (per-repo **read-only** deploy key or none for a public repo), add the
webhook, and point the portfolio's `src/lib/anigramUrl.ts` at the new origin.
