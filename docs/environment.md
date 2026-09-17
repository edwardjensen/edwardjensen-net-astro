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
| `CONTENT_RELAY_READ_KEY` | Yes | Read API key for the relay (`X-Read-Key` header). Required for all relay reads. Note the singular name — the Worker's own secret (`CONTENT_RELAY_READ_KEYS`, see below) supports a comma-separated list for rotation, but CI maps it to this singular env var for the build. |

## CI/CD Pipelines

All workflows are in `.github/workflows/`. Secrets are managed via GitHub Actions — nothing is committed to the repository.

### PR Checks (`pr-checks.yml`)

Runs on every pull request to `main`:

1. **Detect changes** — skips build/a11y for docs-only PRs
2. **Build** — generates `buildinfo.ts`, runs `npm run build`
3. **Accessibility** — starts preview server, runs pa11y against test URLs
4. **PR status** — required check for merge gate

### Staging Deployment (`deploy-staging-direct.yml`)

Triggers on push to `main`. Builds and deploys to a staging Cloudflare Worker.

### Production Deployment (`deploy-prod-site.yml`)

Triggers on version tag push (`v*.*.*`) or manual dispatch:

1. **Validate tag** — semantic version format, on main branch
2. **Build** — generate buildinfo, build site
3. **Deploy** — upload to production Cloudflare Worker
4. **Release** — create GitHub Release

### CMS Republish (`republish-prod.yml`, `republish-staging.yml`)

Triggers via manual dispatch or CMS webhook (`repository_dispatch` from Payload on publish). `republish-prod.yml` checks out the latest production tag and redeploys to production; `republish-staging.yml` builds `main` directly (no tag checkout) and redeploys to staging. Both poll the content relay's list endpoint for `client_payload.relayVersion` before building — see the freshness gate described in `CLAUDE.md`.

### Worker Deployments

- `deploy-hi-redirector.yml` — deploys the short URL redirect worker on code changes

## GitHub Secrets & Variables

### Repository Variables

| Variable | Description |
|----------|-------------|
| `NODE_VERSION` | Node.js version for CI (e.g., `26.9.0`) |

### Repository Secrets

_(No repository-level secrets currently required for builds — all build secrets are in environments.)_

### Environment: Production

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for Worker deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CF_DEPLOYMENT_WORKER` | Production Cloudflare Worker name |
| `CONTENT_RELAY_URL` | Content relay base URL (`https://contentrelay.edwardjensen.net`) |
| `CONTENT_RELAY_READ_KEYS` | Read key for the content relay |

### Environment: Staging

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CF_STAGING_WORKER` | Staging Cloudflare Worker name |
| `CONTENT_RELAY_URL` | Content relay base URL (same relay as production) |
| `CONTENT_RELAY_READ_KEYS` | Read key for the content relay |

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
