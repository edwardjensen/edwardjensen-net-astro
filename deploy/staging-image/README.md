# Staging builder-and-server image

One image that builds the staging site from a content relay and serves it, for the CMS's staging stack on the application server. It replaced the GitHub-runner build and SSH upload that used to deploy staging (`deploy-staging.yml`, retired on 2026-10-30).

It holds the site's source at the commit it was built from, its dependencies (including the lockfile's exact wrangler, and with it workerd) and `supervisor.mjs`. The site is served the same way as before: the site's own Cloudflare Worker, run in workerd by `wrangler dev --local`, so staging matches production's assets handling, redirects and 404 page.

`.github/workflows/staging-image.yml` builds it and pushes `ghcr.io/edwardjensen/edwardjensen-net-astro-staging:main` (and `:<sha>`) on every merge to `main` that changes the site. A pull request that changes the image's inputs builds it without pushing.

## What the supervisor does

1. At start it builds the site (and, if a release is already on disk, serves it meanwhile).
2. A build runs `npm run build` against the selected content source, writes the result to `releases/<timestamp>-<sha7>`, flips the `current` link in one step, restarts `wrangler dev` on it and keeps the newest three releases.
3. A failed build changes nothing: the last good release keeps serving. If nothing has ever built, it retries every minute.
4. Requests made close together (and the wait after each, `DEBOUNCE_MS`, which lets a publish commit first) share one build.

## Content sources

Both read a relay through the same `/v2` contract the production site uses, so staging exercises the same push, relay and build path.

| Source | Reads | Settings |
| --- | --- | --- |
| `staging` (default) | the staging relay | `STAGING_CONTENT_URL`, `STAGING_CONTENT_READ_KEY` |
| `production` | the production relay, to preview the site against real content | `PRODUCTION_CONTENT_URL`, `PRODUCTION_CONTENT_READ_KEY` |

The selected source is **sticky**: it is kept in `DATA_DIR/source.json`, survives a restart, and every build uses it until `POST /source` changes it. A staging publish while `production` is selected still rebuilds, which refreshes the site code, but from production's content. The generated site title shows which source a build used.

**Freshness gate.** The CMS pushes a collection to the relay and then asks for a build, naming the relay version it pushed (`client_payload.relayVersion`). When the staging source is selected, the build first polls the staging relay until it reports at least that version, because KV can serve a stale copy for a short while after a write. It gives up after `RELAY_WAIT_MS` (180 seconds) and fails the build, leaving the last good release serving, as production's republish does. Several publishes close together are waited for at their newest version per collection.

**Event pages.** The `/hi/{tag}/` pages come from the relay's `hi-events` collection. Their forms need `PUBLIC_INTAKE_SUBMIT_URL` and `PUBLIC_HCAPTCHA_SITEKEY` in the container's environment (`docs/environment.md`). Without them the pages build with no form.

## The control port

Port `8080` is for the stack's own network only. Never give it a public router. Every route but `/healthz` needs `Authorization: Bearer $SITE_BUILD_TOKEN`.

| Route | What it does |
| --- | --- |
| `POST /build` | Builds from the selected source. The CMS calls this after a publish, with `{"action": …, "client_payload": {"collection": …, "relayVersion": …}}`. A `source` in the query or body (`?source=production`) builds from that source this once and leaves the selection alone. |
| `POST /source` | Body `{"source":"staging"}` or `{"source":"production"}`. Selects the source, keeps it, and builds from it. |
| `GET /status` | The selected source, the source and release last built, the commit, the last build (its source, result, error and the relay versions it waited for), and which sources are configured. |
| `GET /healthz` | Answers `{"ok":true}` without a token. |

What calls these routes is left open: this is only the door.

## Settings

| Variable | Meaning |
| --- | --- |
| `SITE_BUILD_TOKEN` | Required. The bearer token. |
| `STAGING_CONTENT_URL`, `STAGING_CONTENT_READ_KEY` | The staging relay's base URL (no `/v2`) and this builder's own read key for it. Required unless `CMS_API_URL` is set. |
| `PRODUCTION_CONTENT_URL`, `PRODUCTION_CONTENT_READ_KEY` | Optional. They make the `production` source available. Give the builder a read key of its own. |
| `CMS_API_URL` | Legacy. Used for the staging source only when `STAGING_CONTENT_URL` is not set: the staging CMS's own API root as this container reaches it, read with no key and no freshness gate. It exists so an older stack keeps working; drop it once the relay settings are in place. |
| `PUBLIC_INTAKE_SUBMIT_URL`, `PUBLIC_HCAPTCHA_SITEKEY` | Optional. Give the `/hi/{tag}/` event pages their intake forms. |
| `SITE_TIMEZONE` | For the build date shown on the site (default UTC). |
| `DATA_DIR` | Where `releases/`, `current` and `source.json` live (default `/srv/site`). Mount a volume here, or the selection is lost on a restart. |
| `SITE_PORT` / `CONTROL_PORT` | The site (default 8787) and the control port (default 8080). |
| `DEBOUNCE_MS` / `KEEP_RELEASES` / `RELAY_WAIT_MS` | Defaults 5000, 3 and 180000. |

The image runs as any uid, chosen by the stack: what it writes is `DATA_DIR` and `HOME` (`/cache`).

## Run it locally

```
docker build -f deploy/staging-image/Dockerfile --build-arg NODE_VERSION=$(tr -d '[:space:]' < .node-version) -t staging-image .
docker run --rm -p 8787:8787 -p 8080:8080 -e SITE_BUILD_TOKEN=local -e STAGING_CONTENT_URL=https://<staging relay> -e STAGING_CONTENT_READ_KEY=<key> staging-image
```

Then open <http://localhost:8787/> once the log says the build is current, and `curl -X POST -H 'Authorization: Bearer local' -d '{"source":"production"}' localhost:8080/source` to switch source (it needs the `PRODUCTION_CONTENT_*` settings too).

## Why `NODE_OPTIONS=--dns-result-order=ipv4first`

Astro's Cloudflare prerender starts a server on `localhost` and then connects to it. Where `localhost` resolves to `::1` first and IPv6 loopback doesn't work (Docker Desktop on a Mac did this), the build dies with `ECONNREFUSED`. The image sets the option so IPv4 comes first everywhere.
