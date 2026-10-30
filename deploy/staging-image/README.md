# Staging builder-and-server image

One image that builds the staging site from the staging CMS and serves it, for the CMS's staging stack on the application server. It replaced the GitHub-runner build and SSH upload that used to deploy staging (`deploy-staging.yml`, retired on 2026-10-30).

It holds the site's source at the commit it was built from, its dependencies (including the lockfile's exact wrangler, and with it workerd) and `supervisor.mjs`. The site is served the same way as before: the site's own Cloudflare Worker, run in workerd by `wrangler dev --local`, so staging matches production's assets handling, redirects and 404 page.

`.github/workflows/staging-image.yml` builds it and pushes `ghcr.io/edwardjensen/edwardjensen-net-astro-staging:main` (and `:<sha>`) on every merge to `main` that changes the site. A pull request that changes the image's inputs builds it without pushing.

## What the supervisor does

1. At start it builds the site (and, if a release is already on disk, serves it meanwhile).
2. A build runs `npm run build` with the content source set, writes the result to `releases/<timestamp>-<sha7>`, flips the `current` link in one step, restarts `wrangler dev` on it and keeps the newest three releases.
3. A failed build changes nothing: the last good release keeps serving. If nothing has ever built, it retries every minute.
4. Requests made close together (and the wait after each, `DEBOUNCE_MS`, which lets a publish commit first) share one build.

## The control port

Port `8080` is for the stack's own network only. Never give it a public router. Every route but `/healthz` needs `Authorization: Bearer $SITE_BUILD_TOKEN`.

| Route | What it does |
| --- | --- |
| `POST /build` | Builds from the staging CMS (`CMS_API_URL`). The CMS calls this after a publish. |
| `POST /build?source=production` (or a body `{"source":"production"}`) | Builds from production's content relay (`PRODUCTION_CONTENT_URL`, read with `PRODUCTION_CONTENT_READ_KEY`), to preview the site against real content. The next staging publish builds from staging's content again. What calls it is left open; this is the door. |
| `GET /status` | The current source and release, the last build and whether it worked. |
| `GET /healthz` | Answers `{"ok":true}` without a token. |

## Settings

| Variable | Meaning |
| --- | --- |
| `SITE_BUILD_TOKEN` | Required. The bearer token. |
| `CMS_API_URL` | Required. The staging CMS's API root as this container reaches it, such as `http://<service>:3000/api`. |
| `PRODUCTION_CONTENT_URL`, `PRODUCTION_CONTENT_READ_KEY` | Optional. For `source=production`. |
| `SITE_TIMEZONE` | For the build date shown on the site (default UTC). |
| `DATA_DIR` | Where `releases/` and `current` live (default `/srv/site`). Mount a volume here. |
| `SITE_PORT` / `CONTROL_PORT` | The site (default 8787) and the control port (default 8080). |
| `DEBOUNCE_MS` / `KEEP_RELEASES` | Defaults 5000 and 3. |

The image runs as any uid, chosen by the stack: what it writes is `DATA_DIR` and `HOME` (`/cache`).

## Run it locally

```
docker build -f deploy/staging-image/Dockerfile --build-arg NODE_VERSION=$(tr -d '[:space:]' < .node-version) -t staging-image .
docker run --rm -p 8787:8787 -p 8080:8080 -e SITE_BUILD_TOKEN=local -e CMS_API_URL=http://host.docker.internal:3000/api staging-image
```

Then open <http://localhost:8787/> once the log says the build is current, and `curl -X POST -H 'Authorization: Bearer local' localhost:8080/build` to rebuild.

## Why `NODE_OPTIONS=--dns-result-order=ipv4first`

Astro's Cloudflare prerender starts a server on `localhost` and then connects to it. Where `localhost` resolves to `::1` first and IPv6 loopback doesn't work (Docker Desktop on a Mac did this), the build dies with `ECONNREFUSED`. The image sets the option so IPv4 comes first everywhere.
