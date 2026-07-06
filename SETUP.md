<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Deploy setup — diagrams.vaibhav.co.uk

Living Diagrams deploys to the **`diagrams.vaibhav.co.uk`** subdomain on Hostinger
using the same deploy-branch pattern as the portfolio. The build pipeline is
already in `.github/workflows/deploy.yml`; the steps below are the one-time
manual setup (they need Hostinger + GitHub access).

## 1. GitHub repo

```sh
# from this directory
git remote add origin git@github.com:light-vp/living-diagrams.git
git push -u origin main
```

On the first push to `main`, the GitHub Action builds `dist/` and force-pushes it
to a **`deploy`** branch (via `s0/git-publish-subdir-action`, using the built-in
`GITHUB_TOKEN` — no secrets to configure).

## 2. Hostinger subdomain

1. In hPanel → **Subdomains**, create `diagrams` under `vaibhav.co.uk`. Note the
   document root it creates (e.g. `.../domains/vaibhav.co.uk/public_html/diagrams`
   or a dedicated `diagrams.vaibhav.co.uk` root).
2. In hPanel → **Git**, connect this GitHub repo, set branch **`deploy`**, and
   set the directory to that subdomain's document root.
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
  chrome-less presentation (no palette/toolbar) — this is what the portfolio
  iframe loads.
- The in-app **"source"** link points at the public repo (AGPL §13).

## Fallback

If the Hostinger subdomain/webhook is painful, **Cloudflare Pages** is a drop-in
alternative: connect the repo, build command `npm run build`, output `dist`, and
add the SPA fallback + the `frame-ancestors` header via `_headers`/`_redirects`.
