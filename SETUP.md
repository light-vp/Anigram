<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Deploy setup — diagrams.vaibhav.co.uk

Anigram deploys to the **`diagrams.vaibhav.co.uk`** subdomain on Hostinger
using the same deploy-branch pattern as the portfolio. The build pipeline is
already in `.github/workflows/deploy.yml`; the steps below are the one-time
manual setup (they need Hostinger + GitHub access).

## 1. GitHub repo

```sh
# from this directory — the local default branch is `master`; the deploy
# workflow triggers on `main`, so rename before the first push
git branch -m master main
git remote add origin git@github.com:light-vp/living-diagrams.git
git push -u origin main
```

On the first push to `main`, the GitHub Action builds `dist/` and force-pushes it
to a **`deploy`** branch (via `s0/git-publish-subdir-action`, using the built-in
`GITHUB_TOKEN` — no secrets to configure).

## Rename checklist (Living Diagrams → Anigram, manual)

The code and docs already say **Anigram**. Two identifiers are deliberately
still on the old name until you do these one-time steps:

1. **GitHub repo slug** — create (or rename) the repo as
   `light-vp/anigram`. GitHub 301-redirects the old
   `light-vp/living-diagrams` URLs, so nothing breaks in the meantime.
   Afterwards update `REPO_URL` in `src/engine/canvas/SourceLink.tsx` and the
   remote URL above.
2. **Subdomain (optional, later)** — the app stays at `diagrams.vaibhav.co.uk`
   because the portfolio hardcodes it. If you ever move to
   `anigram.vaibhav.co.uk`, create the new subdomain in hPanel (step 2 below),
   then update `DIAGRAMS_URL` in the portfolio repo
   (`src/components/tool/DiagramConsole.tsx` and
   `src/components/anigram/PlaygroundFrame.tsx`). The `.htaccess`
   `frame-ancestors` header already covers `*.vaibhav.co.uk` — no change needed.

Saved diagrams migrate automatically: on first load the app copies the old
`living-diagrams:doc` localStorage key to `anigram:doc`.

## 2. Hostinger subdomain

1. In hPanel → **Subdomains**, create `diagrams` under `vaibhav.co.uk`. Note the
   document root it creates (e.g. `.../domains/vaibhav.co.uk/public_html/diagrams`
   or a dedicated `diagrams.vaibhav.co.uk` root).
2. In hPanel → **Git**, connect this GitHub repo, set branch **`deploy`**, and
   set the directory to that subdomain's document root. If a key is needed,
   register the Hostinger key as a **per-repo deploy key with write access
   unchecked** (read-only) — never as an account-level SSH key. (A public repo
   needs no key at all.)
3. Add the repository's **webhook URL** (from the Hostinger Git page) to GitHub →
   repo **Settings → Webhooks**, so a push to `deploy` auto-pulls.
4. Ensure SSL is enabled for the subdomain (Hostinger auto-provisions Let's
   Encrypt).

`public/.htaccess` (copied into `dist/` by Vite) provides the SPA rewrite **and**
the `Content-Security-Policy: frame-ancestors` header that lets `vaibhav.co.uk`
embed the app.

## 3. Verify

- `https://diagrams.vaibhav.co.uk` loads the editor.
- `https://diagrams.vaibhav.co.uk/?embed=presentation&scene=oauth2` renders the
  chrome-less presentation (no palette/toolbar) — this is what the portfolio's
  demo iframes load.
- `https://diagrams.vaibhav.co.uk/?embed=app` renders the full playable editor
  (palette + canvas + inspector, no header) — this is what the portfolio's
  playground iframe loads. Edits persist via localStorage.
- The in-app **"source"** link points at the public repo (AGPL §13).

## Fallback

If the Hostinger subdomain/webhook is painful, **Cloudflare Pages** is a drop-in
alternative: connect the repo, build command `npm run build`, output `dist`, and
add the SPA fallback + the `frame-ancestors` header via `_headers`/`_redirects`.
