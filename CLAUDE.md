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
deploys the site to the **staging** environment automatically
(`deploy-staging.yml`: by default the staging server, see "Deployment"). Committing straight to `main` therefore ships, and skips the PR
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
- **Node.js:** 26.x (Active LTS from 2026-10-28). `.node-version` (an exact version, e.g. `26.9.0`) is the single source of truth: `fnm` reads it locally, every `actions/setup-node` step uses `node-version-file: .node-version`, and the staging server runtime image is built from it. There is **no `NODE_VERSION` repository variable**; don't reintroduce one. `engines.node` in `package.json` is a floor, and a `pr-checks.yml` step fails the PR unless its major matches `.node-version`. Patch bumps are deliberate: edit `.node-version`.
- **Package manager:** **npm** (`package-lock.json`; CI runs `npm install`). The CMS repo uses
  pnpm — don't carry the habit across repos.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/payload.ts` | Content relay API client — auto-pagination (100/request), 5 retries with exponential backoff, build-time caching, `X-Read-Key` auth, permalink helpers |
| `src/lib/feed-utils.ts` | Shared helpers for the RSS/JSON feed endpoints |
| `src/config.ts` | Site-wide constants: canonical URL, title, author, feed limits, page sizes, search debounce |
| `src/types/payload.ts` | TypeScript interfaces for all CMS content types |
| `src/lib/intake.ts` | Build-time helpers for the event intake forms: reads a share token's claims, the field table and caps, the `PUBLIC_*` build config |
| `src/pages/hi/[tag].astro` | One static page per event, `/hi/{tag}/`, with the event's text and (when it has a usable token) the intake form |
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

**Build freshness gate.** A CMS publish reaches this repo as a `repository_dispatch` carrying `client_payload.relayVersion` — the version token the relay returned for the push that accompanied that publish. Before building, `republish-prod.yml` — and `deploy-staging.yml` for `staging-relay` dispatches — run `.github/scripts/wait-for-relay.sh` (one shared copy, kept outside the built code so it exists whichever tag is checked out), which polls `GET /v2/{collection}` (the *list* endpoint, i.e. the exact KV key the build reads — not `/v2/meta/`, which is a separate key with its own independent 60s edge cache) until the reported `version` is at least `relayVersion`.

If that does not happen within 180s the step **fails the build** rather than proceeding. Building from unverified relay data is how stale content reached production before; the CMS already refuses to dispatch at all when its relay push fails, and this keeps that guarantee on this side. Re-run the workflow once the relay is healthy.

A dispatch with no `relayVersion`, or a relay worker that reports no `version`, degrades to the older `meta.updatedAt` comparison with a warning. `workflow_dispatch` runs skip the gate entirely — a manual republish is an explicit human decision.

**Collections:** `posts`, `working-notes`, `photography`, `historic-posts`, `pages`, plus `hi-events` (relay-only, optional: see "Event pages and the intake form")

The relay only ever holds **published** documents — the CMS filters on `_status: 'published'`
on every push, so drafts are structurally incapable of reaching a build. Each collection's
fetcher is exported from `src/lib/payload.ts` as `getPosts()`, `getWorkingNotes()`,
`getPhotography()`, `getHistoricPosts()`, `getPages()`.

## Event pages and the intake form

Each event gets its own page, `/hi/{tag}/`, one static page per event in the `hi-events` relay collection, which the CMS builds from its redirector settings whenever they are saved. Adding an event means saving it in the CMS and waiting for the rebuild (a brand-new tag can 404 for a few minutes). The redirector Worker in `cloudflare-workers/hi-redirector/` (`hi.edwardjensen.net/{tag}`) still sends event tags to `/hi` with UTM parameters; pointing them at `/hi/{tag}/` is a separate change, made only once production serves those pages, because the Worker deploys to production on every push to `main` and would otherwise send working short links to a 404.

**`getHiEvents()` is optional.** Unlike the collections above, the relay has no `hi-events` key until the CMS has pushed it once, and a 404 for it returns an empty list with a warning instead of retrying and failing the build (`RelayNotFoundError` in `src/lib/payload.ts`). Each document is `{ id, tag, event, type, heading, message, intakeToken }`, all but the tag nullable. `getStaticPaths()` in `src/pages/hi/[tag].astro` accepts only tags matching `^[a-z0-9-]+$` and drops duplicates.

**What a page shows.** The heading (or "Great to meet you at {event}!") and the message (plain text; a blank line starts a paragraph; escaped, never HTML), then the form, then the same sections as `/hi` (`src/components/sections/HiSections.astro`, shared with `hi.astro` so the two can't drift). The page is `noindex` and not in the sitemap. With no token, an expired token, a token that isn't shaped like one, or the build variables missing, the page has its text and no form.

**The form** (`src/components/sections/IntakeForm.astro`) is a plain `<form>` rendered by this site in its own design, not an iframe. The fields come from the event's **share token**, a signed string the intake system issues and the CMS stores. `src/lib/intake.ts` reads its claims **without verifying them** (the site never holds the signing secret and nothing trusts what it reads): `f` lists the optional fields asked for as letter codes (absent means all of them, an empty string means name only; the name is always asked for and required) and `x` is the expiry, so a link that has already expired at build time gets no form. The page script posts the form with `fetch()` to the intake service and shows the thanks in place, or an error message with what was typed kept and the captcha reset. hCaptcha's script is loaded by the component, so only pages with a form load it; it needs JavaScript, so without it the form shows a notice. hCaptcha's two injected response fields are `display: none` but unlabelled, so the script gives them an `aria-label` as they appear, which keeps pa11y clean.

**Contract with the intake service, which this repo does not own.** The service refuses any website not on its own allowlist, so a new origin that serves the form must be added there first. Keep these in step with it: the token's `f` letter codes and the field table in `src/lib/intake.ts` (labels, input types, `autocomplete`), the field length caps (name 300, email 300, phone 100, organization 300, role 300, website 500, how we met 2000, message 4000), and the error codes it answers with (`name`, `captcha`, `expired`, `invalid`, `too_large`, mapped to sentences in `copy.hi.intake.errors`; `network` is this site's own for a failed request). The form posts `t` (the token), `name`, the optional fields by their keys (`email`, `phone`, `organization`, `role`, `website`, `how_we_met`, `message`), `h-captcha-response` and a `nickname` honeypot that people never see.

**Build settings** (public once built, since they end up in the page HTML): `PUBLIC_INTAKE_SUBMIT_URL` (the intake service's submit URL; https, or http on localhost) and `PUBLIC_HCAPTCHA_SITEKEY`. They are passed to every build step from the repository *variables* `INTAKE_SUBMIT_URL` and `HCAPTCHA_SITEKEY`. If either is missing the pages still build, without forms, and one warning is logged. The submit URL should be the intake service's own platform address rather than a hostname behind a Cloudflare challenge page, because a `fetch()` cannot answer a challenge. See `docs/environment.md`.

**Not in `a11y-urls.json` on purpose:** which event pages exist depends on CMS data, so a fixed URL would break the gate whenever that event is deleted. Check the form pages locally instead: build against a relay that has at least one event with a token, run `astro preview`, and run pa11y (WCAG2AA, as `scripts/a11y-check.js` does) against `/hi/{tag}/`.

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
5. Add the URL to `src/data/a11y-urls.json` for accessibility testing (unless which pages exist
   depends on CMS data, as for the event pages: see "Event pages and the intake form")

### Interactive features
- Use Preact islands (`src/islands/`) for components needing client-side state
- Use `client:load` for immediately-needed interactivity (e.g., navigation)
- Use `client:visible` for below-the-fold interactive components
- Vanilla JS in `public/assets/js/` is acceptable for DOM-heavy features — currently just
  `photo-gallery.js`
- The event intake form's submit script is a bundled `<script>` inside
  `src/components/sections/IntakeForm.astro` (see "Event pages and the intake form").
- Search is the exception: its logic is written inline in `src/pages/search/index.astro` and
  `src/pages/404.astro`, with Lunr loaded from cdnjs via an `is:inline` script. The two copies
  are near-duplicates — change both, or factor them out first.
- External runtime resources: Lunr from cdnjs (search pages), Phosphor icon CSS from unpkg
  (every page), the Stream proxy iframe on `/saintpaulcamera`, and hCaptcha from its own
  host on event pages that have a form (and nowhere else). Everything else is self-hosted.

### Styling
- Use Tailwind utility classes as the default
- Add component classes to `src/styles/global.css` (`@layer components`) only for patterns reused across multiple files
- Follow the existing BEM convention for embedded content blocks

## Environment & Secrets

**This is a public repository** (see "This Repository Is Public" above). No credentials, API
keys, or secrets may ever be committed.

- Local development: `.env.local` (gitignored) — set `CONTENT_RELAY_URL` and `CONTENT_RELAY_READ_KEY`;
  optionally `PUBLIC_INTAKE_SUBMIT_URL` and `PUBLIC_HCAPTCHA_SITEKEY` to render the event forms
  (hCaptcha publishes a test sitekey that works locally)
- CI/CD: GitHub Actions secrets and variables. **A value is a variable only if it is already
  public** (served in the built site or committed here) — this repo's Actions logs are public, and
  variables print in full where secrets are masked. Values both environments use live once at
  repository level. Full table in `docs/environment.md`; rotation procedures live in the CMS repo.
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
- `pa11y` is pinned to `^10.0.0` (pulls in `puppeteer ^25.9.0`) specifically because of a Node
  26 incompatibility: `@puppeteer/browsers`' zip extraction (via `extract-zip`/`yauzl`) silently
  truncates large files — including the `chrome` binary itself — when run on Node 26, while
  exiting 0 and reporting success (confirmed upstream:
  https://github.com/puppeteer/puppeteer/issues/15244, duplicate of
  https://github.com/puppeteer/puppeteer/issues/14957). Puppeteer 24.x and pa11y 9.x hit this on
  every CI run once the runner moved to Node 26, deterministically — not a flaky network issue,
  despite how it first presented ("Could not find Chrome"). Puppeteer 25 fixed the extraction
  path; that's the actual fix, not a version-pin nicety. Do not downgrade `pa11y` below `10.0.0`
  or `puppeteer` below `25.x` while this repo runs on Node 26.

## Deployment

- **Staging:** one workflow, `deploy-staging.yml`, for every staging operation. Each run has three
  independent choices — **site code** (`main` | `latest-tag`), **content source** (`production` =
  production relay | `staging-relay` = staging relay, the path production uses, so relay changes get
  tested | `staging-direct` = the staging CMS itself over Tailscale; no relay, so no event pages) and
  **deploy target** (`local-server` | `cloudflare`). Defaults by trigger (the `Resolve configuration`
  step is the single place to change them): push to `main` → main + production + local-server;
  `staging_cms_publish` dispatch → latest-tag + staging-relay + local-server;
  `staging_cms_photo_publish` dispatch → latest-tag + staging-relay + local-server; a manual run starts at
  main + production + local-server, with all three selectable.
- **Staging server deploys** are an atomic release swap over Tailscale SSH. The runner joins through
  workload identity federation (`vars.TS_OAUTH_CLIENT_ID` / `vars.TS_AUDIENCE`, `id-token: write`) with
  the tags in `vars.TS_TAGS`, and those tags authorise the deploy login: no SSH key, no `sudo`.
  Host, login and path stay **secrets** so they are masked in this public repo's logs. Nothing about
  the target is hardcoded in the workflow: configuration goes in `vars.*` or `secrets.*`. Then rsync into
  `releases/<timestamp>-<sha>/` (the whole `dist/`, hard-linked against `current`), switch the relative `current` symlink, keep the newest 3 releases for rollback.
- **The staging server runs the real worker:** `deploy/staging-server/` (compose file + Dockerfile) runs the site's Cloudflare Worker in workerd via `wrangler dev`, pinned to the lockfile's wrangler, as the deploy login, on `proxy-network` under the alias in `secrets.LOCAL_STAGING_SERVICE_NAME`. Each server deploy copies those files from `main`, writes their `.env`, rebuilds/restarts the runtime and waits for it to answer. Keep it Workers-faithful: don't swap in a static file server, since SSR routes would need the worker.
- **Cloudflare staging is temporary:** `teardown-staging-cloudflare.yml` deletes the staging worker nightly
  (09:00 UTC), so a `deploy_target=cloudflare` build is only served until then; the next such run recreates it.
  It only ever deletes a `-staging` worker name, in the staging environment.
- **No Tailscale OAuth secrets:** every workflow that joins the tailnet (staging deploys and the hi-redirector) uses workload identity federation: `vars.TS_OAUTH_CLIENT_ID` / `vars.TS_AUDIENCE` / `vars.TS_TAGS` on its GitHub environment and `id-token: write` on the job. Don't reintroduce `oauth-secret:`. The hi-redirector only needs network access to the CMS, so its production tags carry no deploy group.
- **Production:** push a version tag (`vX.Y.Z`)
- **Republish:** CMS webhook or manual dispatch rebuilds from the latest production tag
- Target is Cloudflare Workers with static assets (not Pages)
- The Astro Cloudflare adapter generates `dist/server/wrangler.json` — CI deploys using that config

**`@astrojs/cloudflare` and `wrangler` are version-coupled — do not bump either without verifying first.** `@astrojs/cloudflare` bundles `@cloudflare/vite-plugin`, whose version controls Astro's build-mode auto-detection (`"server"` vs `"static"`) and whether the generated Wrangler config includes `legacy_env` — the deploy-time `wrangler` binary must be new enough to accept that field or the deploy fails. A routine minor bump of `@astrojs/cloudflare` broke both staging and production this way in September 2026 (see README.md's "Manually managed version pins" section and PR #38/#39). Before merging a Dependabot bump to either package, run a full local build and `wrangler deploy --dry-run` using `npm install` (not `npm ci`, which can mask a real peer-dependency conflict).
