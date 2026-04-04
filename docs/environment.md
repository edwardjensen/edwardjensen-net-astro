# Environment & Deployment

## Local Development

### Prerequisites

- **Node.js** 24.x LTS
- **Tailscale** VPN connected (the CMS runs on a private network)

### Setup

```sh
npm install
cp .env.example .env.local
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTENT_RELAY_URL` | Yes | Payload CMS REST API base URL (no trailing slash, no `/v2` — appended automatically) |
| `REST_API_KEY` | No | API key for authenticated CMS reads. Not needed — the CMS allows unauthenticated reads over Tailscale |

## CI/CD Pipelines

All workflows are in `.github/workflows/`. Secrets are managed via GitHub Actions — nothing is committed to the repository.

### PR Checks (`pr-checks.yml`)

Runs on every pull request to `main`:

1. **Detect changes** — skips build/a11y for docs-only PRs
2. **Build** — connects to Tailscale VPN, generates `buildinfo.ts`, runs `npm run build`
3. **Accessibility** — starts preview server, runs pa11y against test URLs
4. **PR status** — required check for merge gate

### Staging Deployment (`deploy-staging-direct.yml`)

Triggers on push to `main`. Builds and deploys to a staging Cloudflare Worker.

### Production Deployment (`deploy-prod-site.yml`)

Triggers on version tag push (`v*.*.*`) or manual dispatch:

1. **Validate tag** — semantic version format, on main branch
2. **Build** — Tailscale VPN, generate buildinfo, build site
3. **Deploy** — upload to production Cloudflare Worker
4. **Release** — create GitHub Release

### CMS Republish (`republish-prod.yml`)

Triggers via manual dispatch or CMS webhook. Checks out the latest production tag, rebuilds with fresh CMS content, and redeploys.

### Worker Deployments

- `deploy-hi-redirector.yml` — deploys the short URL redirect worker on code changes
- `deploy-content-relay.yml` — content relay worker (manual dispatch only)

## GitHub Secrets & Variables

### Repository Variables

| Variable | Description |
|----------|-------------|
| `NODE_VERSION` | Node.js version for CI (e.g., `24.14.1`) |

### Repository Secrets

| Secret | Description |
|--------|-------------|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID (CI VPN access to CMS) |
| `TS_OAUTH_CLIENT_SECRET` | Tailscale OAuth client secret |

### Environment: Production

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for Worker deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CF_DEPLOYMENT_WORKER` | Production Cloudflare Worker name |
| `PROD_CMS_REST_URL` | Production CMS REST API URL |

### Environment: Staging

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CF_STAGING_WORKER` | Staging Cloudflare Worker name |

## Cloudflare Worker Secrets

Set via `wrangler secret put <NAME>` (not committed to the repo):

| Worker | Secret | Description |
|--------|--------|-------------|
| content-relay | `CONTENT_RELAY_API_KEY` | API key for write operations to the KV cache |
| maps-proxy | `GOOGLE_MAPS_API_KEY` | Google Maps Static API key |
| stream-proxy | `CLOUDFLARE_STREAM_CUSTOMER_ID` | Stream customer identifier |
| stream-proxy | `CLOUDFLARE_STREAM_VIDEO_ID` | Stream video identifier |

## CI-Generated Files

These files are written by CI workflows before the build and **should not be committed** with CI-generated values:

- `src/data/buildinfo.ts` — build metadata (commit, version, date, environment). A local dev fallback is committed.
- `cloudflare-workers/hi-redirector/hi-redirects.json` — redirect mappings fetched from CMS at deploy time.
