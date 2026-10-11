<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Deploy setup — served at anigram.vaibhav.co.uk

Anigram has no hosting of its own. The portfolio repo
(`light-vp/vaibhav.co.uk`) deploys it: its GitHub Action checks out this
repo's `main`, builds it with a relative base (`--base=./`), and folds the
output into the site's `dist/anigram-app/`. Hostinger serves that folder at
`https://vaibhav.co.uk/anigram-app/` (what the portfolio's own pages embed,
same-origin) and, as it is the subdomain's document root, at
`https://anigram.vaibhav.co.uk/` (the canonical address, and the one share
links use).

Anigram can't pull its own build into Hostinger: Hostinger's GitHub
integration allows one repository per website, and the subdomain belongs to
the vaibhav.co.uk website, whose one repository is the portfolio. So the
portfolio's deploy runs every 30 minutes as well as on its own merges, and
redeploys when this repo's `main` has a commit newer than the one it last
shipped (`anigram-app/anigram-commit.txt` on its `deploy` branch).

This repo's `.github/workflows/ci.yml` checks every PR (typecheck, lint,
tests, the MCP server over stdio, the reference docs, browser tests and
sheet screenshots) with a read-only token.

## Releasing a change

1. PR → merge to `main` (CI must be green).
2. It is live within about half an hour. To ship it at once, run the
   portfolio's **Deploy to Hostinger** workflow by hand (Actions → Deploy to
   Hostinger → Run workflow). GitHub pauses scheduled workflows in a repo
   with no commits for 60 days; a manual run turns them back on.
3. For the npm package, see [RELEASING.md](RELEASING.md).

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

Notes: the portfolio's deploy strips this repo's `public/.htaccess` and
writes a minimal one into `dist/anigram-app/`. It sets
`Content-Security-Policy: frame-ancestors` so only vaibhav.co.uk can frame
the app, and turns `RewriteEngine On` with no rules so the portfolio's own
route rewrites don't apply when the folder is served as the subdomain. The in-app
**"source"** link points at the public repo.

## Rename (Living Diagrams → Anigram)

The GitHub repo is now `light-vp/Anigram`, and `REPO_URL` in
`src/app/SourceLink.tsx` points there. GitHub 301-redirects the old
`light-vp/living-diagrams` URLs, so the portfolio workflow's checkout keeps
working, but its `repository:` line should move to the new slug when that
workflow is next touched.

Saved diagrams migrate automatically: on first load the app copies the old
`living-diagrams:doc` localStorage key to `anigram:doc`. (Note: with the app
now served under `vaibhav.co.uk`, browser storage lives on that origin.)
