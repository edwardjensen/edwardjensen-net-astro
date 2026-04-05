# Copilot Instructions for edwardjensen-net-astro

This is an Astro static site deployed to Cloudflare Workers. Content comes from Payload CMS via its REST API. Interactive components use Preact islands. Styling is Tailwind CSS 4.x with a custom brand design system.

**Any code changes must be reflected in this document and in `docs/` if they affect architecture, design system, or environment configuration.**

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
- **Content source:** Payload CMS REST API (fetched at build time)
- **Deployment:** Cloudflare Workers (not Pages) via Wrangler v4
- **CI/CD:** GitHub Actions — PR checks, staging on push to main, production on version tag
- **Accessibility:** pa11y (WCAG 2.1 AA) enforced as a required PR gate
- **Node.js:** Latest LTS (24.x)

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/payload.ts` | Payload CMS REST API client (auto-pagination, build-time caching) |
| `src/types/payload.ts` | TypeScript interfaces for all CMS content types |
| `src/styles/global.css` | Tailwind theme, brand color tokens, component CSS classes |
| `src/layouts/BaseLayout.astro` | Root layout — HTML head, SEO, header nav, footer, photo modal |
| `src/data/navbar.ts` | Navigation structure |
| `src/data/featured-tags.ts` | Featured tag page configuration |
| `src/data/buildinfo.ts` | Build metadata (CI-generated; local fallback committed) |
| `astro.config.mjs` | Astro configuration |
| `wrangler.jsonc` | Cloudflare Workers configuration |

## Content Architecture

All content is fetched from Payload CMS REST API. The API client appends `/v2` to the base URL automatically.

**Collections:** `posts`, `working-notes`, `photography`, `historic-posts`, `pages`

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
- Vanilla JS in `public/assets/js/` is acceptable for DOM-heavy features (photo gallery, search)

### Styling
- Use Tailwind utility classes as the default
- Add component classes to `src/styles/global.css` (`@layer components`) only for patterns reused across multiple files
- Follow the existing BEM convention for embedded content blocks

## Environment & Secrets

**This is a public repository.** No credentials, API keys, or secrets may ever be committed.

- Local development: `.env.local` (gitignored)
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

## Deployment

- **Staging:** automatic on push to `main`
- **Production:** push a version tag (`vX.Y.Z`)
- **Republish:** CMS webhook or manual dispatch rebuilds from the latest production tag
- Target is Cloudflare Workers with static assets (not Pages)
- The Astro Cloudflare adapter generates `dist/server/wrangler.json` — CI deploys using that config
