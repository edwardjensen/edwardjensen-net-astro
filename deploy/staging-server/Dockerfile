# Runtime for the staging site: Node plus the exact wrangler the site was built with, and with it workerd, Cloudflare's Workers runtime. Built on the server by `docker compose up --build`; Docker's layer cache means it only rebuilds when NODE_VERSION or WRANGLER_VERSION changes. workerd needs glibc, so this is -slim, not alpine.
ARG NODE_VERSION
FROM node:${NODE_VERSION}-slim
ARG WRANGLER_VERSION
RUN npm install --global --no-fund --no-audit "wrangler@${WRANGLER_VERSION}" \
 && npm cache clean --force
