# Environment & Deployment

## Local Development

### Prerequisites

- **Node.js** 26.x (Active LTS from 2026-10-28)

### Setup

```sh
npm install
cp .env.example .env.local
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTENT_RELAY_URL` | Yes | Base URL of the Cloudflare KV content relay (no trailing slash, no `/v2` — appended automatically). Production: `https://contentrelay.edwardjensen.net` |
| `PUBLIC_INTAKE_SUBMIT_URL` | No | Where the event intake forms on `/hi/{tag}/` post: the intake service's submit URL (https; `http://localhost` is allowed for local development). Public, since it ends up in the built pages. Use the service's own platform address rather than a hostname behind a Cloudflare challenge, because a `fetch()` cannot answer one. Unset, the event pages build without forms |
| `PUBLIC_HCAPTCHA_SITEKEY` | No | The hCaptcha sitekey for those forms (public by nature). The hCaptcha site must list the hostname of every page that shows a form. hCaptcha's published test sitekey works for local development. Unset, the event pages build without forms |
| `CONTENT_RELAY_READ_KEY` | Yes | Read API key for the relay (`X-Read-Key` header). Required for all relay reads. Note the singular name — the Worker's own secret (`CONTENT_RELAY_READ_KEYS`, see below) supports a comma-separated list for rotation, but CI maps it to this singular env var for the build. |

## CI/CD Pipelines

All workflows are in `.github/workflows/`. Secrets are managed via GitHub Actions — nothing is committed to the repository.

### PR Checks (`pr-checks.yml`)

Runs on every pull request to `main`:

1. **Detect changes** — skips build/a11y for docs-only PRs
2. **Build** — generates `buildinfo.ts`, runs `npm run build`
3. **Accessibility** — starts preview server, runs pa11y against test URLs
4. **PR status** — required check for merge gate

### Staging Deployment (`deploy-staging.yml`)

The only staging workflow. Triggers: push to `main`, manual dispatch, and CMS `repository_dispatch` (`staging_cms_publish`, `staging_cms_photo_publish`). One job, so the deploy uses the same checkout and lockfile wrangler that built the site.

| Choice | Options |
|--------|---------|
| Site code | `main`, `latest-tag` (highest `v*` tag) |
| Content source | `production` (production relay), `staging-relay` (staging relay — how relay changes are tested), `staging-direct` (staging CMS over Tailscale; no relay, so no event pages) |
| Deploy target | `local-server`, `cloudflare` |

Defaults: push to `main` → main + production + local-server; `staging_cms_publish` → latest-tag + staging-relay + local-server; `staging_cms_photo_publish` → main + staging-relay + local-server; a manual run starts at main + production + local-server. `staging-relay` dispatches run the relay freshness gate first. The generated site title records the code version and content source, e.g. `Edward Jensen [STAGING · v14.2.0 · staging-relay]`.

**Server deploys** go over Tailscale SSH (the runner is `tag:ci`; the tailnet ACL authorises it, so there is no SSH key). The new release is rsynced into `releases/<timestamp>-<sha>/` (hard-linked against `current`, so unchanged files cost nothing), `current` is switched with an atomic symlink swap, and the newest 3 releases are kept. The web server must serve `current` resolved per request, so mount the deploy directory (not the symlink) and point the document root at `current`; it is never restarted. To roll back, repoint `current` at an earlier release.

### Production Deployment (`deploy-prod-site.yml`)

Triggers on version tag push (`v*.*.*`) or manual dispatch:

1. **Validate tag** — semantic version format, on main branch
2. **Build** — generate buildinfo, build site
3. **Deploy** — upload to production Cloudflare Worker
4. **Release** — create GitHub Release

### CMS Republish (`republish-prod.yml`)

Triggers via manual dispatch or CMS webhook (`repository_dispatch` from Payload on publish). Checks out the latest production tag and redeploys to production. Staging republishes are handled by `deploy-staging.yml`. Both run `.github/scripts/wait-for-relay.sh` to poll the relay's list endpoint for `client_payload.relayVersion` before building — see the freshness gate in `CLAUDE.md`.

### Worker Deployments

- `deploy-hi-redirector.yml` — deploys the short URL redirect worker on code changes

## GitHub Secrets & Variables

### Repository Variables

| Variable | Description |
|----------|-------------|
| `NODE_VERSION` | Node.js version for CI (e.g., `26.9.0`) |

`INTAKE_SUBMIT_URL` and `HCAPTCHA_SITEKEY` (listed under each environment below) are set per environment, because the PR checks run in the `production` environment and staging builds use the `staging` one. They are optional: a build without them is fine, it just has no event forms. Both values are public once built (they are in the page's HTML, and in the build artifact), but they are kept as secrets so they stay out of this public repository's settings and are masked in workflow logs. The workflows read `secrets.NAME || vars.NAME`, so a variable of the same name also works; a secret wins.

### Repository Secrets

_(No repository-level secrets currently required for builds — all build secrets are in environments.)_

### Environment: Production

| Secret | Description |
|--------|-------------|
| `INTAKE_SUBMIT_URL` | Passed to the build as `PUBLIC_INTAKE_SUBMIT_URL` (see above). Optional |
| `HCAPTCHA_SITEKEY` | Passed to the build as `PUBLIC_HCAPTCHA_SITEKEY`. Optional |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for Worker deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CF_DEPLOYMENT_WORKER` | Production Cloudflare Worker name |
| `CONTENT_RELAY_URL` | Content relay base URL (`https://contentrelay.edwardjensen.net`) |
| `CONTENT_RELAY_READ_KEYS` | Read key for the content relay |

### Environment: Staging

| Secret | Description |
|--------|-------------|
| `CONTENT_RELAY_URL` / `CONTENT_RELAY_READ_KEYS` | The **production** relay, as in the production environment (the `production` content source) |
| `STAGING_RELAY_URL` / `STAGING_RELAY_READ_KEYS` | The staging relay (the `staging-relay` content source) |
| `STAGING_CMS_URL` | The staging CMS API base, without `/v2` (the `staging-direct` content source; reached over Tailscale, no key) |
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_CLIENT_SECRET` | Tailscale OAuth client for the runner (`tag:ci`); needed for `staging-direct` and the `local-server` target |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PATH` | Staging server (tailnet name), the deploy user, and the directory holding `releases/` and `current` |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `CF_DEPLOYMENT_WORKER` | For the `cloudflare` target |
| `INTAKE_SUBMIT_URL` / `HCAPTCHA_SITEKEY` | Passed to the build as `PUBLIC_INTAKE_SUBMIT_URL` / `PUBLIC_HCAPTCHA_SITEKEY`. Optional |

## Cloudflare Worker Secrets

Workers whose source lives in this repo (`cloudflare-workers/`) have their secrets set via `wrangler secret put <NAME>` from here (not committed to the repo):

| Worker | Secret | Description |
|--------|--------|-------------|
| maps-proxy | `GOOGLE_MAPS_API_KEY` | Google Maps Static API key |
| stream-proxy | `CLOUDFLARE_STREAM_CUSTOMER_ID` | Stream customer identifier |
| stream-proxy | `CLOUDFLARE_STREAM_VIDEO_ID` | Stream video identifier |

The **content-relay** worker's secrets are set the same way, but from the `edwardjensencms-payload` repo, since that's where its source lives:

| Worker | Secret | Description |
|--------|--------|-------------|
| content-relay | `CONTENT_RELAY_WRITE_KEY` | Write key used by Payload to push content updates |
| content-relay | `CONTENT_RELAY_READ_KEYS` | Comma-separated read keys (supports rotation) |

## CI-Generated Files

These files are written by CI workflows before the build and **should not be committed** with CI-generated values:

- `src/data/buildinfo.ts` — build metadata (commit, version, date, environment). A local dev fallback is committed.
- `cloudflare-workers/hi-redirector/hi-redirects.json` — redirect mappings fetched from CMS at deploy time.
