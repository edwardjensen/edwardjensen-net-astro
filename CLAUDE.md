# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository. **It is the single source of truth for how this site works.** There is no parallel
`.github/copilot-instructions.md` — that file was renamed to this one, so there is exactly one
place to update and nothing to keep in sync.

This is an Astro static site deployed to Cloudflare Workers. Content is fetched at build time from a Cloudflare KV content relay (`contentrelay.edwardjensen.net`), which is populated by Payload CMS on every publish. Interactive components use Preact islands. Styling is Tailwind CSS 4.x with a custom brand design system.

**Any code change must be reflected in this file, and in `docs/` if it affects architecture,
the design system, or environment configuration.** Documentation belongs in the *same* change
as the code, not a trailing cleanup pass.

`docs/` is a current snapshot of the system, not an archive of past decisions. When something
becomes obsolete, delete it rather than marking it deprecated — but if it encoded a decision
that still constrains future work, move that reasoning into this file first.

## This Repository Is Public

**`edwardjensen-net-astro` is a public GitHub repository. Everything pushed here is world
-readable, permanently and immediately.** Treat that as a constraint on all output, not just on
code.

That applies to **every artifact**, not only source files:

- Source code and configuration
- This file, `README.md`, and everything in `docs/`
- Commit messages and branch names
- **Pull request titles and descriptions**
- Issue text and code comments

### The cross-repo hazard

The CMS that feeds this site, **`edwardjensencms-payload`, is a private repository**. These two
are developed together and their documentation is frequently updated in the same sitting, which
makes copying detail from there to here an easy and consequential mistake.

Detail that is perfectly fine in the private CMS repo must **not** be carried into this one:

| Don't bring over | Examples |
|------------------|----------|
| Internal hostnames | CMS admin/staging hostnames, the staging relay host, anything Tailscale-only |
| Infrastructure topology | Homelab server details, SSH targets, deployment paths, container names |
| Database and storage identifiers | Postgres database names, role names, R2 bucket names |
| Operational runbook specifics | Backup/restore procedures, migration playbooks, incident steps |

When writing docs here, describe **this site's** behaviour and its contract with the relay.
Reference the CMS by its role ("the CMS pushes to the relay on publish"), not by its internal
addresses or operational detail. If a reader would need private-repo access to act on a
sentence, that sentence belongs in the private repo instead.

### What is already public and fine to name

The site's own domains, the production relay hostname (`contentrelay.edwardjensen.net`), and
the supporting worker domains in `cloudflare-workers/` are all published in this repo already —
they're reachable on the open internet and naming them adds nothing. The read key is the
secret, not the URL.

### Secrets

No credentials, API keys, tokens, or secrets may ever be committed — see "Environment &
Secrets" below. A secret pushed to a public repo is compromised the moment it lands and must be
rotated, not merely reverted: the value stays in the git history and in anything that has
already mirrored it.

## Working Practice: Branch and PR, Never `main`

**Any coding agent working in this repository must do its work on a separate git branch and
land it on `main` through a pull request. Never commit directly to `main`.**

This is not a style preference — `main` is a deployment trigger. A push to `main` builds and
deploys the site to the **staging** Cloudflare Worker automatically
(`deploy-staging-direct.yml`). Committing straight to `main` therefore ships, and skips the PR
checks — the build validation and the pa11y accessibility gate, which is a required merge gate
precisely so inaccessible markup can't reach the site.

**The expected flow:**

1. Branch from `main` — `feature/X`, `fix/X`, `chore/X`, or `docs/X`.
2. Commit the work there, including documentation updates in the *same* change (this file and
   `docs/`, per the rule at the top).
3. Open a PR to `main` and let the checks run.
4. Merge the PR. That deploys to staging.
5. Promote to production separately by tagging `vX.Y.Z` — see "Deployment".

If you find yourself already on `main` with uncommitted work, create the branch first and
commit there. If a task genuinely seems to require committing to `main`, stop and ask.

## Critical: Use Current Documentation

**Do not rely on internal knowledge of Astro, Payload CMS, or any integration patterns.** Astro and its ecosystem evolve rapidly, and cached training data is frequently outdated.

Before implementing any feature, consult the current official documentation:

- **Astro**: https://docs.astro.build/en/getting-started/
- **Astro + Payload CMS**: https://docs.astro.build/en/guides/cms/payload/

This applies to routing, content collections, integrations, configuration, and deployment. If in doubt, fetch the docs — do not guess.

## Project Overview

- **Framework:** Astro 6.x (static site generation)
- **Interactive components:** Preact via `@astrojs/preact`
- **Styling:** Tailwind CSS 4.x with `@tailwindcss/typography`
- **Content source:** Cloudflare KV content relay at `contentrelay.edwardjensen.net` (populated by Payload CMS on publish; fetched at build time via `CONTENT_RELAY_URL` + `CONTENT_RELAY_READ_KEY`)
- **Deployment:** Cloudflare Workers (not Pages) via Wrangler v4
- **CI/CD:** GitHub Actions — PR checks, staging on push to main, production on version tag
- **Accessibility:** pa11y (WCAG 2.1 AA) enforced as a required PR gate
- **Node.js:** 26.x (Active LTS from 2026-10-28). Local work is pinned by `.node-version`
  (read by `fnm` on `cd`); CI reads the `NODE_VERSION` GitHub repository variable. A
  `pr-checks.yml` step asserts the two majors agree on every PR.
- **Package manager:** **npm** (`package-lock.json`; CI runs `npm install`). The CMS repo uses
  pnpm — don't carry the habit across repos.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/payload.ts` | Content relay API client — auto-pagination (100/request), 5 retries with exponential backoff, build-time caching, `X-Read-Key` auth, permalink helpers |
| `src/lib/feed-utils.ts` | Shared helpers for the RSS/JSON feed endpoints |
| `src/config.ts` | Site-wide constants: canonical URL, title, author, feed limits, page sizes, search debounce |
| `src/types/payload.ts` | TypeScript interfaces for all CMS content types |
| `src/pages/search-index.json.ts` | Build-time JSON search index consumed by the Lunr search |
| `src/styles/global.css` | Tailwind theme, brand color tokens, component CSS classes |
| `src/layouts/BaseLayout.astro` | Root layout — HTML head, SEO, header nav, footer, photo modal |
| `src/data/navbar.ts` | Navigation structure |
| `src/data/featured-tags.ts` | Featured tag page configuration |
| `src/data/buildinfo.ts` | Build metadata (CI-generated; local fallback committed) |
| `astro.config.mjs` | Astro configuration |
| `wrangler.jsonc` | Cloudflare Workers configuration |

## Content Architecture

All content is fetched from the Cloudflare KV content relay. The API client in `src/lib/payload.ts` appends `/v2` to `CONTENT_RELAY_URL` automatically and authenticates with `X-Read-Key: <CONTENT_RELAY_READ_KEY>`.

The relay is populated by Payload CMS via a push hook on every content publish. Astro builds read from the relay — no VPN or direct CMS access is required.

**Build freshness gate.** A CMS publish reaches this repo as a `repository_dispatch` carrying `client_payload.relayVersion` — the version token the relay returned for the push that accompanied that publish. Before building, **both** `republish-prod.yml` and `republish-staging.yml` poll `GET /v2/{collection}` (the *list* endpoint, i.e. the exact KV key the build reads — not `/v2/meta/`, which is a separate key with its own independent 60s edge cache) until the reported `version` is at least `relayVersion`.

If that does not happen within 180s the step **fails the build** rather than proceeding. Building from unverified relay data is how stale content reached production before; the CMS already refuses to dispatch at all when its relay push fails, and this keeps that guarantee on this side. Re-run the workflow once the relay is healthy.

A dispatch with no `relayVersion`, or a relay worker that reports no `version`, degrades to the older `meta.updatedAt` comparison with a warning. `workflow_dispatch` runs skip the gate entirely — a manual republish is an explicit human decision.

**Collections:** `posts`, `working-notes`, `photography`, `historic-posts`, `pages`

The relay only ever holds **published** documents — the CMS filters on `_status: 'published'`
on every push, so drafts are structurally incapable of reaching a build. Each collection's
fetcher is exported from `src/lib/payload.ts` as `getPosts()`, `getWorkingNotes()`,
`getPhotography()`, `getHistoricPosts()`, `getPages()`.

**URL patterns (must be preserved):**
- Blog posts: `/posts/YYYY/YYYY-MM/slug`
- Working notes: `/notes/YYYY-MM-DD/slug`
- Photography: `/photos/YYYY/YYYY-MM/slug`
- Historic posts: `/archive/posts/slug`
- Pages: `/slug` (catch-all)

**Content embedding:** Blog posts may contain `<!-- embed:ID -->` placeholders in their `contentHtml`. The `blocks` array on the post document contains the embedded working note content. Post templates resolve these inline.

## Design System

The brand color palette, typography, and component classes are defined in `src/styles/global.css`. See `docs/design-system.md` for full details.

**Key rules:**
- `brand-orange` (#F58F29) fails WCAG contrast — use for decorative/accent only, never for body text
- `brand-orange-dark` (#a95b00) is the accessible alternative for text (4.5:1 on smoke)
- Dark mode is system-preference based (`prefers-color-scheme: dark`)
- Fonts are self-hosted via `@fontsource-variable` (Fraunces for headers, Source Sans 3 for body)

## Patterns to Follow

### Adding a new page type
1. Define the data fetching function in `src/lib/payload.ts`
2. Add TypeScript types in `src/types/payload.ts`
3. Create the page in `src/pages/` using `getStaticPaths()` + `Astro.props`
4. Use `ContentWrapper` or `BaseLayout` as the layout
5. Add the URL to `src/data/a11y-urls.json` for accessibility testing

### Interactive features
- Use Preact islands (`src/islands/`) for components needing client-side state
- Use `client:load` for immediately-needed interactivity (e.g., navigation)
- Use `client:visible` for below-the-fold interactive components
- Vanilla JS in `public/assets/js/` is acceptable for DOM-heavy features — currently just
  `photo-gallery.js`
- Search is the exception: its logic is written inline in `src/pages/search/index.astro` and
  `src/pages/404.astro`, with Lunr loaded from cdnjs via an `is:inline` script. The two copies
  are near-duplicates — change both, or factor them out first. Lunr is the only external
  runtime dependency on the site; everything else is self-hosted.

### Styling
- Use Tailwind utility classes as the default
- Add component classes to `src/styles/global.css` (`@layer components`) only for patterns reused across multiple files
- Follow the existing BEM convention for embedded content blocks

## Environment & Secrets

**This is a public repository** (see "This Repository Is Public" above). No credentials, API
keys, or secrets may ever be committed.

- Local development: `.env.local` (gitignored) — set `CONTENT_RELAY_URL` and `CONTENT_RELAY_READ_KEY`
- CI/CD: GitHub Actions secrets and environment secrets
- Worker secrets: `wrangler secret put` (Cloudflare runtime bindings)

See `docs/environment.md` for the full list of required secrets and variables.

## Accessibility Requirements

- Semantic HTML throughout (proper heading hierarchy, landmark regions)
- All images must have meaningful alt text
- Keyboard navigation for all interactive elements
- Focus management in modals (trap focus, restore on close)
- Color contrast compliance with the brand palette
- pa11y checks must pass in CI — a PR that fails accessibility checks must not merge
- Test URLs are defined in `src/data/a11y-urls.json` (`src/data/a11y-urls.ts` re-exports them for Astro components)
- The "Accessibility Checks" CI job sets `PUPPETEER_SKIP_DOWNLOAD: true` on `npm ci` and runs
  `npx puppeteer browsers install chrome` as its own explicit step, rather than relying on
  puppeteer's own `npm install` postinstall to fetch Chrome. On the GitHub-hosted runner that
  postinstall download completes *partially* — it creates the target folder but not the
  executable inside it — without failing `npm ci`, and the corrupt-but-present folder then
  makes a later `puppeteer browsers install` treat Chrome as already installed and skip it too.
  Skipping the implicit download entirely and doing exactly one explicit install avoids that
  partial-download state. Do not remove either half as redundant.

## Deployment

- **Staging:** automatic on push to `main`
- **Production:** push a version tag (`vX.Y.Z`)
- **Republish:** CMS webhook or manual dispatch rebuilds from the latest production tag
- Target is Cloudflare Workers with static assets (not Pages)
- The Astro Cloudflare adapter generates `dist/server/wrangler.json` — CI deploys using that config

**`@astrojs/cloudflare` and `wrangler` are version-coupled — do not bump either without verifying first.** `@astrojs/cloudflare` bundles `@cloudflare/vite-plugin`, whose version controls Astro's build-mode auto-detection (`"server"` vs `"static"`) and whether the generated Wrangler config includes `legacy_env` — the deploy-time `wrangler` binary must be new enough to accept that field or the deploy fails. A routine minor bump of `@astrojs/cloudflare` broke both staging and production this way in September 2026 (see README.md's "Manually managed version pins" section and PR #38/#39). Before merging a Dependabot bump to either package, run a full local build and `wrangler deploy --dry-run` using `npm install` (not `npm ci`, which can mask a real peer-dependency conflict).
