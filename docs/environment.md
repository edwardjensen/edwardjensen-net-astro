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
| `CONTENT_ALLOW_EMPTY` | No | Set to `1` to let a required collection come back empty. Without it, the build (and `npm run check:source`) fails when a source returns no documents for one, because that is almost always the wrong source. `.env.local-cms` sets it, since a fresh local CMS is empty. |
| `CONTENT_FETCH_TIMEOUT_MS` | No | How long one fetch attempt may take before it is abandoned and retried. Default 30000. |

### Choosing a content source

The client reads any source that serves the `/v2` list contract: the content relay, or a CMS's own `/api/v2`. An Astro **mode** picks the source, so switching is a script name rather than an edit to `.env.local`. A mode loads `.env.<mode>` and then `.env.<mode>.local` on top of `.env` and `.env.local`, so the mode's values win. Variables already in the shell win over every file.

| Script | Reads | Where its settings live |
|--------|-------|-------------------------|
| `npm run dev` | whatever `.env.local` says | `.env.local` (unchanged) |
| `npm run dev:production-relay` | the production relay | `.env.production-relay` (committed). Your read key comes from `.env.production-relay.op` (1Password, below) or goes in `.env.production-relay.local`; without either, the key from `.env.local` is used |
| `npm run dev:staging-relay` | the staging relay | URL and read key from `.env.staging-relay.op` (1Password, below) or in `.env.staging-relay.local` |
| `npm run dev:staging-direct` | a staging CMS's own `/api/v2` (no relay, no key) | URL in `.env.staging-direct.local` |
| `npm run dev:local-cms` | a CMS on this machine at `http://localhost:3000/api` | `.env.local-cms` (committed) |

Each `dev:*` script has a `build:*` twin for running `astro preview` against that source. The build and dev server print one line saying which host they read and which mode they ran in.

- **Committed mode files hold public values only.** The production relay's URL is public; the others are left blank, and their `.local` files are git-ignored. Never put a staging URL or any key in a committed file.
- **A mode file that leaves `CONTENT_RELAY_READ_KEY=` blank on purpose** keeps the production key in `.env.local` from being sent to a different host.
- **Keys from 1Password, never on disk.** For the two relay modes, a git-ignored `.env.<mode>.op` holding 1Password secret references (`CONTENT_RELAY_READ_KEY=op://<vault>/<item>/<field>`, and `CONTENT_RELAY_URL` the same way for staging) makes the `dev:` and `build:` scripts run under `op run` ([`scripts/with-op-env.sh`](../scripts/with-op-env.sh)), which fetches the values at launch. It needs the 1Password CLI signed in through the desktop app. Without the file, the scripts run as before. `npm run check:source` isn't wrapped: run it as `op run --env-file=.env.<mode>.op -- npm run check:source -- --mode <mode>`.
- **`--mode` changes only `import.meta.env.MODE`.** `astro build --mode staging-relay` is still an optimized production build (`import.meta.env.PROD` is true), so code must not branch on `MODE === "production"`.
- **Check a source before building:** `npm run check:source` reads every collection from the configured source and fails with a list of problems (unreachable, key refused, empty, drafts, missing fields). Add `-- --mode staging-relay` to check a mode. It runs in PR checks before the build.

## CI/CD Pipelines

All workflows are in `.github/workflows/`. Secrets are managed via GitHub Actions — nothing is committed to the repository.

### PR Checks (`pr-checks.yml`)

Runs on every pull request to `main` or to a `hotfix/**` branch:

1. **Detect changes** — skips build/a11y for docs-only PRs
2. **Build** — generates `buildinfo.ts`, runs `npm run build`
3. **Accessibility** — starts preview server, runs pa11y against test URLs
4. **PR status** — required check for merge gate

### Staging (`staging-image.yml`)

No GitHub workflow deploys staging. `staging-image.yml` builds `deploy/staging-image/` into one image, `edwardjensen-net-astro-staging:main` (plus `:<sha7>`), on every merge to `main` that changes the site, and pushes it to GHCR. A pull request that changes the image's inputs builds it without pushing. The CMS's staging stack follows the `:main` tag. The image builds the site from a content relay and serves it, rebuilding whenever the CMS asks. The source is the staging relay by default, or production's relay to preview the site against real content; the choice is sticky, so every build uses it, and a restart keeps it, until it is changed. A staging publish waits for the staging relay to reach the version it pushed before building. Set `PUBLIC_INTAKE_SUBMIT_URL` and `PUBLIC_HCAPTCHA_SITEKEY` in the container and the `/hi/{tag}/` event pages build with their forms. The image's README covers the routes and settings. The generated site title records the code version and content source.

The earlier GitHub-driven staging was retired on 2026-10-30: `deploy-staging.yml` (a build on a runner, then an upload over Tailscale SSH, with a choice of code, content source and target), the `deploy/staging-server/` runtime and the nightly Cloudflare teardown.

### Production Deployment (`deploy-prod-site.yml`)

Triggers on version tag push (`v*.*.*`) or manual dispatch:

1. **Validate tag** — semantic version format, and on `main` or the next patch on a hotfix branch (`.github/scripts/validate-release-tag.sh`; see "Hotfixes" in `CLAUDE.md`)
2. **Build** — checks out **the tag** (never `main`), generates buildinfo with the tagged commit, builds the site
3. **Deploy** — uploads that build to the production Cloudflare Worker
4. **Release** — create GitHub Release

### CMS Republish (`republish-prod.yml`)

Triggers via manual dispatch or CMS webhook (`repository_dispatch` from Payload on publish). Checks out the latest production tag and redeploys to production. Staging rebuilds are handled by the staging image. This workflow runs `.github/scripts/wait-for-relay.sh` to poll the relay's list endpoint for `client_payload.relayVersion` before building — see the freshness gate in `CLAUDE.md`.

### Worker Deployments

- `deploy-hi-redirector.yml` — deploys the short URL redirect worker on code changes. It joins the tailnet through the production environment's trust credential (`vars.TS_OAUTH_CLIENT_ID` / `vars.TS_AUDIENCE` / `vars.TS_TAGS`, `id-token: write`) only to fetch the redirect config from the CMS

## GitHub Secrets & Variables

**Variable or secret?** A value is a **variable** only if it is already public: served in the built site or committed to this repo. This repository is public, so its Actions logs are too; variables print in full there, secrets are masked. Everything else is a **secret**.

**Precedence.** An environment value overrides a repository value of the same name. Values used by both environments live once at repository level; only what genuinely differs per environment is set on the environment.

Rotation procedures for the credentials below (and for those the CMS owns) live in the CMS repository's documentation, not here.

### Repository

| Name | Kind | Description |
|------|------|-------------|
| `TIMEZONE` | Variable | Time zone for the build date in the footer |
| `CONTENT_RELAY_URL` | Variable | Production content relay base URL (`https://contentrelay.edwardjensen.net`) |
| `INTAKE_SUBMIT_URL` | Variable | Passed to the build as `PUBLIC_INTAKE_SUBMIT_URL`. Optional: without it the event pages have no form |
| `HCAPTCHA_SITEKEY` | Variable | Passed to the build as `PUBLIC_HCAPTCHA_SITEKEY`. Optional, as above |
| `CONTENT_RELAY_READ_KEYS` | Secret | Read key for the production relay (this repo's own key; the relay accepts several) |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Cloudflare account ID |

### Environment protection

Each environment only accepts deployments from the refs meant to deploy there (deployment branch policies, set in the repository settings):

| Environment | Allowed refs | Used by |
|-------------|--------------|---------|
| `production` | branch `main`, tags `v*` | `deploy-prod-site.yml` (tag push), `republish-prod.yml` and `deploy-hi-redirector.yml` (both run on `main`) |

A job that references an environment from any other ref is rejected before it starts, so it never receives that environment's secrets or its Tailscale credential. That is why no `pull_request` job uses an environment. Creating `v*` tags is also restricted to repository admins by the release tag ruleset, so automation can't cut a production release.

### Environment: Production

| Name | Kind | Description |
|------|------|-------------|
| `CF_DEPLOYMENT_WORKER` | Variable | Production Cloudflare Worker name |
| `CLOUDFLARE_API_TOKEN` | Secret | Cloudflare API token for production deploys (site and hi-redirector) |
| `CMS_URL` | Secret | Production CMS root (no `/api`), reached over Tailscale by the hi-redirector deploy |
| `TS_OAUTH_CLIENT_ID` / `TS_AUDIENCE` | Variable | Production's Tailscale trust credential (workload identity federation, GitHub OIDC), used by the hi-redirector deploy to reach the CMS. No OAuth secret |
| `TS_TAGS` | Variable | Tags the hi-redirector runner joins with. It only needs network access to the CMS, not SSH, so no deploy group tag |

PR checks don't use an environment: they build with the repository-level values (`CONTENT_RELAY_URL`, `CONTENT_RELAY_READ_KEYS`, `HCAPTCHA_SITEKEY`, `INTAKE_SUBMIT_URL`), which point at production.

No workflow uses a `staging` environment any more, so its secrets and variables (the Cloudflare staging worker, the staging relay's read key, the Tailscale trust credential and the staging server's login) have no reader and can be deleted from the repository settings.

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
