# Staging builder-and-server image

One image that builds the staging site from a content relay and serves it, for the CMS's staging stack on the application server. It replaced the GitHub-runner build and SSH upload that used to deploy staging (`deploy-staging.yml`, retired on 2026-10-30).

It holds the site's source at the commit it was built from (`main`), a second copy built from the newest production tag (`v*`, when the image was built with one), its dependencies (including the lockfile's exact wrangler, and with it workerd) and `supervisor.mjs`. The site is served the same way as before: the site's own Cloudflare Worker, run in workerd by `wrangler dev --local`, so staging matches production's assets handling, redirects and 404 page.

`.github/workflows/staging-image.yml` builds it and pushes `ghcr.io/edwardjensen/edwardjensen-net-astro-staging:main` (and `:<sha>`) on every merge to `main` that changes the site, and again when a `v*` tag is pushed (still from `main`, with the new tag as the release tree). A pull request that changes the image's inputs builds it without pushing.

## What the supervisor does

1. At start it builds the site (and, if a release is already on disk, serves it meanwhile).
2. A build runs `npm run build` against the selected content source, writes the result to `releases/<timestamp>-<sha7>`, flips the `current` link in one step, restarts `wrangler dev` on it and keeps the newest three releases.
3. A failed build changes nothing: the last good release keeps serving. If nothing has ever built, it retries every minute.
4. Requests made close together (and the wait after each, `DEBOUNCE_MS`, which lets a publish commit first) share one build.

## Code trees

The build runs in one of two trees: `main` (the commit the image was built from) or `release` (the newest `v*` tag, fetched from GitHub into `/release` with its own dependencies at image build time, from `RELEASE_TAG` and `RELEASE_SHA`). Which tree builds is selected the same way as the content source: it is sticky (`source.json` keeps `source` and `code`), a restart keeps it, and every build, including one a CMS publish starts, uses it. A release folder records which tree built it in `release.json`, and that tree's wrangler serves it. An image built without `RELEASE_TAG` has only `main`.

The site title and footer show the tree (`main-<sha7>` or the tag) and the content source.

## The viewer

The viewer is the staging site's front door. A browser that opens any page of the site (a top-level navigation, which it marks with `Sec-Fetch-Dest: document`) gets the viewer at that same URL: a top bar to choose the site code and the content source and to start a rebuild, the site in a frame, and a footer that collapses to a status icon when there is nothing to report. The frame asks for the same URL as an iframe and gets the site itself, and the address bar follows the frame, so deep links, reloads and bookmarks keep working. Feed readers, assets, `curl` and anything else that sends no document header get the site. `?__raw=1` on a URL shows that page on its own, and the viewer's top bar links to the current page that way. Responses carry `Vary: Sec-Fetch-Dest` so a browser never reuses one kind for the other.

While a build runs (including one a CMS publish starts), the frame is replaced by its progress: why it started, the phase, elapsed time, and the build output. When it finishes the frame returns to the same page; a failed build shows its error until dismissed, and the last good release keeps serving. The choices are global (not per viewer) and apply to later CMS publishes too. The viewer's POSTs accept only same-origin JSON.

The site itself is wrangler on `WRANGLER_PORT` (loopback only), behind a small front proxy on the site port that passes everything through unchanged, with a self-refreshing "rebuilding" page while wrangler is down. The viewer's own routes use `/_viewer/` and `/metrics`; the site has no pages by those names.

| Route (site port) | What it does |
| --- | --- |
| `GET /_viewer/status` | The same snapshot as the control port's `GET /status`, without the token. |
| `GET /_viewer/events` | Server-sent events: a `snapshot` (status and recent output) on connect, then `status` on each phase change, `log` per output line, and `done`. |
| `POST /_viewer/select` | Same-origin JSON `{"code"?, "source"?}`. |
| `POST /_viewer/rebuild` | Same-origin JSON. Rebuilds from the selection. |

## Metrics

`GET /metrics` on the site port serves Prometheus's text format, unauthenticated like the rest of the site port (the stack keeps staging reachable only from the internal network). Every metric is defined in `metrics.mjs`, with the `ejnet_staging_` prefix and label values that come only from the lists in that file: anything else is counted as `other`, so a request can't create series.

| Metric | Answers |
| --- | --- |
| `ejnet_staging_info` | Which image: the `main` commit, the release tag and Node version (always 1). |
| `ejnet_staging_build_requests_total{trigger}`, `ejnet_staging_cms_pushes_total{collection}` | What is asking for rebuilds. Requests close together share one build. |
| `ejnet_staging_builds_total{code,source,result}`, `ejnet_staging_build_failures_total{reason}` | How builds end, and why they fail (`relay_timeout`, `build_failed`, `other`). |
| `ejnet_staging_build_duration_seconds`, `ejnet_staging_relay_wait_seconds` | How long builds take, and how long the freshness gate waits (histograms). |
| `ejnet_staging_build_phase{phase}`, `ejnet_staging_build_queued` | What it is doing now. |
| `ejnet_staging_selected_code`, `ejnet_staging_selected_source`, `ejnet_staging_serving_code`, `ejnet_staging_serving_source` | What is selected against what is serving (one-hot). They differ after a failed switch. |
| `ejnet_staging_last_build_success`, `…_last_build_finished_timestamp_seconds`, `…_last_build_success_timestamp_seconds`, `…_release_built_timestamp_seconds` | The last build and how old the serving release is. |
| `ejnet_staging_site_up`, `ejnet_staging_background_task_up{task}`, `ejnet_staging_wrangler_unexpected_exits_total`, `ejnet_staging_proxy_unavailable_total` | Whether the site answers. |
| `ejnet_staging_proxy_requests_total{handler,code}`, `ejnet_staging_control_requests_total{route,code}`, `ejnet_staging_viewers` | Traffic, by handler or route and the class of the answer. |
| `ejnet_staging_container_memory_bytes`, `…_memory_peak_bytes`, `…_memory_limit_bytes` | The container's memory from its cgroup, where the host reports it. Builds are the peaks. |
| `process_*` | The supervisor's own CPU, memory and start time. |

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
| `POST /select` | Body `{"code":"main"\|"release","source":"staging"\|"production"}`, either optional. Selects, keeps and builds. |
| `GET /status` | The selected source and code, the phase (`idle`, `requested`, `waiting-for-relay`, `building`, `publishing` or `restarting`), what is serving (`serving`: tree, commit, source, when and how long), the trees available, requests waiting for the next build (`pending`), the source and release last built, the commit, the last build (its source, result, error and the relay versions it waited for), and which sources are configured. |
| `GET /healthz` | Answers `{"ok":true}` without a token. |

A request that arrives while a build runs is never dropped: the follow-up build keeps its relay gates and its reason (a CMS publish stays a CMS publish in the viewer). What calls these routes is left open: this is only the door.

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
| `SITE_PORT` / `CONTROL_PORT` | The site and viewer (default 8787) and the control port (default 8080). |
| `WRANGLER_PORT` | Where wrangler listens behind the proxy, on loopback (default 8788). |
| `RELEASE_TAG` / `RELEASE_SHA` / `RELEASE_DIR` | Set by the Dockerfile when a release tree is present (`/release`). |
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

## Why `ca-certificates` is installed

Astro's prerender runs inside workerd, and workerd verifies TLS against the system's certificate bundle, which the `-slim` base image does not include. A build that fetches the content relay over HTTPS then fails every fetch with `internal error`. (The builder used to read the CMS over plain HTTP inside the stack, so nothing needed a bundle until it moved to the relay.)
