<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 Vaibhav Patel -->

# Deploy setup — served at anigram.vaibhav.co.uk

Anigram deploys itself, the same way the portfolio does. On every merge to
`main`, `.github/workflows/deploy.yml` runs the checks, builds `dist/`, and
pushes it to this repo's **`deploy`** branch. Hostinger pulls that branch
into the subdomain's folder whenever GitHub's webhook tells it a push
happened. No secrets are involved: the workflow's built-in token pushes the
branch, and Hostinger reads this public repo over HTTPS.

`.github/workflows/ci.yml` checks every PR (typecheck, lint, tests, the MCP
server over stdio, the reference docs, browser tests and sheet screenshots)
with a read-only token.

## One-time setup in Hostinger

Do this after the first merge that carries `deploy.yml`, so the `deploy`
branch exists.

**1. Give the subdomain its own folder** (hPanel)

1. **Domains → Subdomains**: delete `anigram.vaibhav.co.uk`. Until now it
   pointed at `public_html/anigram-app`, which the portfolio's deploy fills.
2. Create it again: subdomain `anigram`, tick **Custom folder for
   subdomain**, folder `anigram`. Leave the folder empty.

The subdomain is down between these steps and the first deploy below:
a few minutes.

**2. Point Git at it** (hPanel)

1. **Advanced → Git → Create a new repository**.
2. Repository address: `https://github.com/light-vp/Anigram.git`
3. Branch: `deploy`
4. Install path: the `anigram` folder from step 1.
5. **Create**, then **Deploy** once. `https://anigram.vaibhav.co.uk/` loads.

**3. Make it automatic** (hPanel, then GitHub)

1. In hPanel's Git list, **Auto deployment** next to the new repository →
   copy the **Webhook URL**.
2. GitHub → this repo → **Settings → Webhooks → Add webhook**: paste the
   URL, content type `application/json`, "Just the push event", **Add
   webhook**.

From then on a merge to `main` is live in a couple of minutes. To redeploy
without a change, run **Actions → Deploy → Run workflow**.

Once this works, the portfolio's deploy can stop copying Anigram into
`public_html/anigram-app/` for the subdomain. It still builds the copy at
`vaibhav.co.uk/anigram-app/` that its own pages embed same-origin, until
those embeds point at the subdomain.

## Releasing a change

1. PR → merge to `main` (CI must be green). It deploys itself.
2. For the npm package, see [RELEASING.md](RELEASING.md).

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

Notes: `public/.htaccess` ships with the build. It sets
`Content-Security-Policy: frame-ancestors` so only vaibhav.co.uk can frame
the app, and sends deep links to `index.html`. The portfolio's copy at
`/anigram-app/` replaces it with a minimal one of its own. The in-app
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
