# Staging server runtime

These files run the staging site on the staging server. They run the site's own Cloudflare Worker in [workerd](https://github.com/cloudflare/workerd), Cloudflare's open-source Workers runtime, through `wrangler dev`. A plain static file server would only approximate Cloudflare; this runs the same worker build that production runs.

That means staging matches production's assets handling, trailing-slash redirects (`/archive` → `/archive/`) and 404 page. Any route that later opts into on-demand rendering (`export const prerender = false`) also works here without server changes.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Node plus the exact wrangler version the site was built with. The `wrangler.json` the build generates only works with that version. |
| `docker-compose.yml` | Runs `wrangler dev` against the live release, on `proxy-network`, as the deploy login. It sets a fixed Compose project name (`edwardjensen-net-staging`), so container names don't reveal the deploy directory in this public repo's logs. |
| `.dockerignore` | Ignores everything, because the build context is the whole deploy directory and the Dockerfile copies nothing in. |

## How it gets there

You don't copy these files by hand. On every staging deploy to the server, `.github/workflows/deploy-staging.yml` does the following:

1. Uploads the whole build (`dist/`: `server/` with the worker, `client/` with its assets) as a new release, then points `current` at it.
2. Copies these files into the deploy directory. They always come from `main`, even when the deploy builds an older tag.
3. Writes a `.env` beside them (see below).
4. Runs `docker compose up -d --build` and restarts the service. wrangler reads the release when it starts, so the restart is what switches releases.
5. Fails the deploy unless the site answers within 60 seconds.

The image is built on the server and only rebuilds when the Node or wrangler version changes.

## Settings (`.env`)

The workflow writes these values. None of them is stored in this repo.

| Variable | Source |
| --- | --- |
| `NODE_VERSION` | The repo's `.node-version` file, the same Node the site was built with |
| `WRANGLER_VERSION` | The wrangler version installed from the lockfile for the build being deployed |
| `SITE_UID` / `SITE_GID` | The deploy login's own IDs, read on the server. The deploy directory is readable only by that login, so the runtime runs as it. |
| `SITE_ALIAS` | The `LOCAL_STAGING_SERVICE_NAME` secret in the staging environment. This is the name the reverse proxy reaches the runtime by on `proxy-network`. |

## Layout on the server

```
<deploy directory>/
├── docker-compose.yml, Dockerfile,        copied and written by the workflow
│   .dockerignore, .env
├── .cache/                                wrangler's home and local state
├── current -> releases/<newest>           relative link to the live release
└── releases/<timestamp>-<sha>/            the newest 3 releases
    ├── server/                            the worker and its wrangler.json
    └── client/                            static assets
```

The whole deploy directory is mounted into the container, not the `current` symlink. Docker resolves a mounted symlink only once, when the container starts. The mount is read-write because wrangler writes a `.wrangler/` scratch directory into the release it runs; that directory is deleted along with the release.

## Rolling back

To roll back, point `current` at an earlier release and restart the service:

```sh
ln -sfn releases/<earlier-release> current.tmp && mv -Tf current.tmp current
docker compose restart
```

Run these in the deploy directory as the deploy login. The next deploy moves `current` forward again.

## Running it locally

To try it against a local build, set up the same layout in a scratch directory:
- copy `dist/server` and `dist/client` into `releases/test/`
- link `current` to `releases/test`
- add a `.env` with the four values above
- create the network once with `docker network create proxy-network`

Then run `docker compose up --build`.

Any container on `proxy-network` can reach the site at `http://<SITE_ALIAS>/`.
