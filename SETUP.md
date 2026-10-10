<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Deploy setup — served at anigram.vaibhav.co.uk

Anigram has **no hosting of its own**. The portfolio repo
(`light-vp/vaibhav.co.uk`) deploys it: its GitHub Action checks out this repo's
`main` branch, builds it with a relative base (`--base=./`), folds the output
into the site's `dist/anigram-app/`, and Hostinger serves the whole thing.
That folder is also the document root of the subdomain, so the same files
answer at `https://anigram.vaibhav.co.uk/` (the canonical address, and the one
share links use) and at `https://vaibhav.co.uk/anigram-app/` (what the
portfolio's own pages embed, same-origin). This repo's own workflow (`.github/workflows/ci.yml`) is CI
only — typecheck, lint, and both build variants — with a read-only token.

## Releasing a change

1. PR → merge to `main` here (CI must be green).
2. Trigger a portfolio deploy: either merge anything to `vaibhav.co.uk`'s `main`,
   or run its **Deploy to Hostinger** workflow manually (Actions →
   Deploy to Hostinger → Run workflow). The next deploy always picks up this
   repo's latest `main`.

## URLs

- `https://anigram.vaibhav.co.uk/` — the full workbench (standalone).
- `https://anigram.vaibhav.co.uk/?embed=app` — the workbench without its
  header bar (what the portfolio's playground iframe loads).
- `https://anigram.vaibhav.co.uk/?embed=1&scene=<id>` — the chrome-less
  sheet for iframes (scenes: `grid`, `solar-home`, `water-tower`, `hydro-dam`,
  `data-centre`). `?embed=presentation` is the same view, kept for the
  portfolio's existing `DiagramConsole`; its old scene ids still resolve —
  `cdn` → `data-centre`, `microservices` → `grid`, `oauth2` → `solar-home` —
  but the portfolio's tab labels and copy describe the old cloud scenes and
  want updating to match.
- `https://anigram.vaibhav.co.uk/?screen=1` — the wall-screen tour.
- The portfolio's brief page lives at `https://vaibhav.co.uk/anigram`.

Notes: the portfolio's deploy strips this repo's `public/.htaccess` (its SPA
rewrite is root-relative and unnecessary — embeds address the app by query
string only) and writes a minimal `.htaccess` into `dist/anigram-app/`. It
sets `Content-Security-Policy: frame-ancestors` so only vaibhav.co.uk can
frame the app, and turns `RewriteEngine On` with no rules so the portfolio's
own route rewrites don't apply when the folder is served as the subdomain. The in-app **"source"** link points at the public repo.

## Rename (Living Diagrams → Anigram)

The GitHub repo is now `light-vp/Anigram`, and `REPO_URL` in
`src/app/SourceLink.tsx` points there. GitHub 301-redirects the old
`light-vp/living-diagrams` URLs, so the portfolio workflow's checkout keeps
working, but its `repository:` line should move to the new slug when that
workflow is next touched.

Saved diagrams migrate automatically: on first load the app copies the old
`living-diagrams:doc` localStorage key to `anigram:doc`. (Note: with the app
now served under `vaibhav.co.uk`, browser storage lives on that origin.)

## Fallback

If serving under the main site ever becomes a problem, the app can be given
its own subdomain again: restore a deploy workflow like `vaibhav.co.uk`'s
(build → push `dist/` to a `deploy` branch, SHA-pinned publish action,
`persist-credentials: false`), create the subdomain in Hostinger hPanel →
Git (per-repo **read-only** deploy key or none for a public repo), add the
webhook, and point the portfolio's `src/lib/anigramUrl.ts` at the new origin.
