# The staging site's builder and server in one image, for the CMS's staging stack on as2: the site's source at the commit it was built from, its dependencies (including the exact wrangler from the lockfile, and with it workerd), and a supervisor that builds the site from the CMS and serves it. Built by .github/workflows/staging-image.yml with the repo root as context and NODE_VERSION read from .node-version. workerd needs glibc, so this is -slim, not alpine.
ARG NODE_VERSION
FROM node:${NODE_VERSION}-slim
ARG GIT_SHA=unknown
ENV SITE_SHA=${GIT_SHA} NODE_ENV=development NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false ASTRO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The stack picks the uid this runs as, so the few places a build writes are open to any uid: its scratch inside /app (wrangler creates .wrangler and node_modules/.mf), the data folder and the home folder.
RUN mkdir -p /app/dist /app/.astro /app/node_modules/.vite /srv/site /cache \
 && chmod a+rwx /app /app/node_modules /app/dist /app/.astro /app/node_modules/.vite /app/src/data /srv/site /cache \
 && chmod a+rw /app/src/data/buildinfo.ts
# Astro's prerender server listens on `localhost` and then connects to it. Where `localhost` resolves to ::1 first and IPv6 loopback does not work (Docker Desktop did this), the build dies with ECONNREFUSED; IPv4 first avoids it everywhere.
ENV NODE_OPTIONS=--dns-result-order=ipv4first HOME=/cache
EXPOSE 8787 8080
CMD ["node", "/app/deploy/staging-image/supervisor.mjs"]
