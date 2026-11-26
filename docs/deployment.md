# Preview and deployment

## No installation

The site needs no package manager, framework or runtime service. All fonts are
system fonts, and every image, stylesheet and script is a local file. Do not
add an `npm install` step or a `package.json`.

Node.js (see `.node-version`) runs the maintenance scripts. They import only
built-in modules. To preview the exact public files:

```sh
node scripts/package.mjs dist
node scripts/serve.mjs dist        # --port 8080 by default
```

Visit `http://127.0.0.1:8080` and stop the server with Ctrl+C. `dist/` is
ignored by Git. The preview server answers like GitHub Pages, so the site's
clean URLs work locally:

| Request | Response |
| --- | --- |
| `/docs/installation` | `docs/installation.html` |
| `/docs/` | `docs/index.html` |
| `/docs` | 301 redirect to `/docs/` |
| `/docs/installation.html` | Still served, so old links keep working |
| Anything else | `404.html` with status 404 |

A plain static file server such as `python3 -m http.server` does not map
`/docs/installation` to `docs/installation.html`, so page links would 404 there.

## GitHub Pages and DNS

Pages is already configured for this repository:

| Setting | Value |
| --- | --- |
| Pages source | **GitHub Actions** (`build_type: workflow`) |
| Custom domain | `porto.synctune.it`, set in **Settings > Pages** |
| HTTPS | Enforced once GitHub issued the certificate |
| DNS | Vercel DNS for `synctune.it`: `porto` `CNAME` `porto-containers.github.io` |

The root `CNAME` file records the hostname; with Actions publishing it does not
configure the Pages setting by itself. If the domain is ever removed, set it
again in **Settings > Pages** (or `PUT /repos/{owner}/{repo}/pages` with
`cname`) before changing DNS, so the hostname is never left unclaimed.

The `synctune.it` zone has a Vercel wildcard (`*`) record. Removing the
`porto` CNAME would send the hostname back to Vercel, not to GitHub. A new
certificate waits for cached wildcard answers to expire (TTL 1800 seconds);
track it with `gh api repos/porto-containers/porto.synctune.it/pages` and the
`https_certificate.state` field instead of removing and re-adding the domain.

## Workflow

`.github/workflows/pages.yml` runs on pull requests, pushes to `main`, a weekly
schedule and manual dispatch:

- **Check and package** runs the unit tests, confirms the generated pages match
  the vendored docs (`build.mjs --check`), copies the public files and checks
  every local link, asset, anchor, unique id and basic page structure. Page
  links, `og:url` and `sitemap.xml` entries must use clean URLs (see
  [URLs](maintenance.md#urls)). On `main` pushes and manual runs it uploads
  the Pages artifact.
- **Outbound links** requests every external URL. Pinned GitHub links to
  Porto's source are verified by the sync script instead. Rate limits, server
  errors and timeouts are retried, then reported as warnings; 4xx responses and
  unknown hosts fail. Known upstream failures are listed in
  `scripts/check-links.mjs` and reported as warnings.
- **Deploy GitHub Pages** deploys that artifact. Only this job gets
  `pages: write` and `id-token: write`, and it never runs for pull requests or
  the weekly schedule.

Each event and branch has its own concurrency group, so scheduled or manual
runs never cancel a push. Pull request runs cancel older runs of the same PR,
and deployments queue in a separate `pages-deploy` group.
Redeploy with **Actions > Website > Run workflow** on `main`. Actions are pinned
to full commit SHAs and the workflow needs no secrets.

## Published files

`scripts/package.mjs` is the single list of public files: `index.html`,
`404.html`, `docs/*.html`, `assets/`, `CNAME`, `.nojekyll`, `robots.txt` and
`sitemap.xml`. Markdown, scripts, tests, vendored sources and repository
metadata are not published. `404.html` uses root-absolute asset paths because
GitHub Pages serves it for missing paths at any depth.

## Other static hosts

Publish the output of `node scripts/package.mjs <dir>`. The site needs no
environment variables or server functions, but its links omit `.html`: the host
must serve `/docs/installation` from `docs/installation.html` and `/docs/` from
`docs/index.html`, as GitHub Pages does. Turn on the host's clean or pretty URL
option if it has one. Select `404.html` as the not-found page if the host
requires it.
