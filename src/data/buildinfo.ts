// Default build info for local development.
// This file is overwritten by CI/CD workflows (deploy-staging-direct.yml,
// deploy-prod-site.yml, republish-prod.yml) before npm run build.
// Do not commit CI-generated versions back to the repo.
export const buildInfo = {
  commit: "local",
  buildId: "local",
  version: "local",
  buildName: "local",
  siteTitle: "LOCAL DEV" as string | undefined,
} as const;
