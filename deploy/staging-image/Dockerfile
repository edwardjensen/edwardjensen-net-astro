# The staging site's builder and server in one image, for the CMS's staging stack on as2: the site's source at the commit it was built from, its dependencies (including the exact wrangler from the lockfile, and with it workerd), and a supervisor that builds the site from the CMS and serves it. Built by .github/workflows/staging-image.yml with the repo root as context and NODE_VERSION read from .node-version. workerd needs glibc, so this is -slim, not alpine.
ARG NODE_VERSION
FROM node:${NODE_VERSION}-slim
ARG GIT_SHA=unknown
# The newest production tag and its commit, when the image is built with one: a second copy of the site, built from that tag, so staging can serve either `main` or what production last shipped.
ARG RELEASE_TAG=
ARG RELEASE_SHA=
ENV SITE_SHA=${GIT_SHA} RELEASE_TAG=${RELEASE_TAG} RELEASE_SHA=${RELEASE_SHA} NODE_ENV=development NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false ASTRO_TELEMETRY_DISABLED=1
# workerd verifies TLS against the system's certificate bundle, which the -slim image does not carry. Without it the prerender server, which runs in workerd, fails every HTTPS fetch of the content relay with "internal error".
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The stack picks the uid this runs as, so the few places a build writes are open to any uid: its scratch inside /app (wrangler creates .wrangler and node_modules/.mf), the data folder and the home folder.
RUN mkdir -p /app/dist /app/.astro /app/node_modules/.vite /srv/site /cache \
 && chmod a+rwx /app /app/node_modules /app/dist /app/.astro /app/node_modules/.vite /app/src/data /srv/site /cache \
 && chmod a+rw /app/src/data/buildinfo.ts
# The release tree: the tag's source from GitHub (this repository is public) with its own dependencies, opened to any uid like /app. Skipped when no RELEASE_TAG is given.
RUN if [ -n "$RELEASE_TAG" ]; then \
      mkdir -p /release \
 && curl -fsSL "https://github.com/edwardjensen/edwardjensen-net-astro/archive/refs/tags/${RELEASE_TAG}.tar.gz" | tar -xz --strip-components=1 -C /release \
 && cd /release && npm ci \
 && mkdir -p dist .astro node_modules/.vite \
 && chmod a+rwx /release node_modules dist .astro node_modules/.vite src/data \
 && chmod a+rw src/data/buildinfo.ts; \
    fi
# Astro's prerender server listens on `localhost` and then connects to it. Where `localhost` resolves to ::1 first and IPv6 loopback does not work (Docker Desktop did this), the build dies with ECONNREFUSED; IPv4 first avoids it everywhere.
ENV NODE_OPTIONS=--dns-result-order=ipv4first HOME=/cache
EXPOSE 8787 8080
CMD ["node", "/app/deploy/staging-image/supervisor.mjs"]
