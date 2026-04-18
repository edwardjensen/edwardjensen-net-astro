# Environment & Deployment

## Local Development

### Prerequisites

- **Node.js** 24.x LTS

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
| `CONTENT_RELAY_READ_KEYS` | Yes | Read API key for the relay (`X-Read-Key` header). Required for all relay reads. The value may be a single key or comma-separated list (same format as the Cloudflare Worker secret). |

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

### CMS Republish (`republish-prod.yml`)

Triggers via manual dispatch or CMS webhook. Checks out the latest production tag, rebuilds with fresh content from the relay, and redeploys.

### Worker Deployments

- `deploy-hi-redirector.yml` — deploys the short URL redirect worker on code changes

## GitHub Secrets & Variables

### Repository Variables

| Variable | Description |
|----------|-------------|
| `NODE_VERSION` | Node.js version for CI (e.g., `24.14.1`) |

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

Set via `wrangler secret put <NAME>` (not committed to the repo):

| Worker | Secret | Description |
|--------|--------|-------------|
| content-relay | `CONTENT_RELAY_WRITE_KEY` | Write key used by Payload to push content updates |
| content-relay | `CONTENT_RELAY_READ_KEYS` | Comma-separated read keys (supports rotation) |
| maps-proxy | `GOOGLE_MAPS_API_KEY` | Google Maps Static API key |
| stream-proxy | `CLOUDFLARE_STREAM_CUSTOMER_ID` | Stream customer identifier |
| stream-proxy | `CLOUDFLARE_STREAM_VIDEO_ID` | Stream video identifier |

## CI-Generated Files

These files are written by CI workflows before the build and **should not be committed** with CI-generated values:

- `src/data/buildinfo.ts` — build metadata (commit, version, date, environment). A local dev fallback is committed.
- `cloudflare-workers/hi-redirector/hi-redirects.json` — redirect mappings fetched from CMS at deploy time.
