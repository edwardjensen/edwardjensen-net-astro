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

**Server deploys** go over Tailscale SSH. The runner joins the tailnet through Tailscale workload identity federation (GitHub OIDC, so the job needs `id-token: write`) with `tag:ci` plus the staging deploy group's tag, and those tags are what authorise its dedicated deploy login: there is no SSH key or `known_hosts` entry. A `Preflight SSH` step checks the login before anything is uploaded, comparing rather than printing it because the logs are public. The deploy login has no `sudo`. The new release is rsynced into `releases/<timestamp>-<sha>/` (hard-linked against `current`, so unchanged files cost nothing), `current` is switched with an atomic symlink swap, and the newest 3 releases are kept. The web server must serve `current` resolved per request, so mount the deploy directory (not the symlink) and point the document root at `current`; it is never restarted. To roll back, repoint `current` at an earlier release.

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

**Variable or secret?** A value is a **variable** only if it is already public: served in the built site or committed to this repo. This repository is public, so its Actions logs are too; variables print in full there, secrets are masked. Everything else is a **secret**.

**Precedence.** An environment value overrides a repository value of the same name. Values used by both environments live once at repository level; only what genuinely differs per environment is set on the environment.

Rotation procedures for the credentials below (and for those the CMS owns) live in the CMS repository's documentation, not here.

### Repository

| Name | Kind | Description |
|------|------|-------------|
| `NODE_VERSION` | Variable | Node.js version for CI (e.g. `26.9.0`) |
| `TIMEZONE` | Variable | Time zone for the build date in the footer |
| `CONTENT_RELAY_URL` | Variable | Production content relay base URL (`https://contentrelay.edwardjensen.net`) |
| `INTAKE_SUBMIT_URL` | Variable | Passed to the build as `PUBLIC_INTAKE_SUBMIT_URL`. Optional: without it the event pages have no form |
| `HCAPTCHA_SITEKEY` | Variable | Passed to the build as `PUBLIC_HCAPTCHA_SITEKEY`. Optional, as above |
| `CONTENT_RELAY_READ_KEYS` | Secret | Read key for the production relay (this repo's own key; the relay accepts several) |
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_CLIENT_SECRET` | Secret | Tailscale OAuth client (`tag:ci`) used by the hi-redirector only |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare account ID |

### Environment: Production

| Name | Kind | Description |
|------|------|-------------|
| `CF_DEPLOYMENT_WORKER` | Variable | Production Cloudflare Worker name |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API token for production deploys (site and hi-redirector) |
| `CMS_URL` | Secret | Production CMS root (no `/api`), reached over Tailscale by the hi-redirector deploy |

PR checks also run in this environment, so they build with production values.

### Environment: Staging

| Name | Kind | Description |
|------|------|-------------|
| `CF_DEPLOYMENT_WORKER` | Variable | Staging Cloudflare Worker name (the `cloudflare` target) |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API token scoped to the staging Worker |
| `CMS_URL` | Secret | Staging CMS root (no `/api`); the `staging-direct` source reads `$CMS_URL/api` over Tailscale, with no key |
| `STAGING_RELAY_URL` / `STAGING_RELAY_READ_KEYS` | Secret | Staging relay and this repo's read key for it (the `staging-relay` source) |
| `TS_TAGS` | Variable | Tags the staging runner joins with, comma-separated (`tag:ci` plus the staging deploy group's tag). Must match the tag the deploy login is registered under |
| `TS_OAUTH_CLIENT_ID` / `TS_AUDIENCE` | Variable | Staging's Tailscale trust credential (workload identity federation), for the `staging-direct` source and the server target. Not the same thing as the repository *secret* of the same name |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PATH` | Secret | Staging server (its MagicDNS name, never a LAN address, which would bypass Tailscale SSH), deploy login, and the directory holding `releases/` and `current`. Kept as secrets rather than variables so they are masked in the public logs |

Staging inherits `CONTENT_RELAY_URL` and `CONTENT_RELAY_READ_KEYS` from the repository, so the `production` source reads the production relay.

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
