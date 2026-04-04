# edwardjensen.net — Astro + Payload CMS

Source code for [edwardjensen.net](https://www.edwardjensen.net), a personal blog and photography site built with [Astro](https://astro.build) and [Payload CMS](https://payloadcms.com). Previously built with Jekyll — this is a ground-up rewrite using modern tooling.

This repository is public. It demonstrates how Payload CMS integrates with an Astro static site, including CI/CD pipelines, Cloudflare Workers deployment, and how AI coding tools (GitHub Copilot) were used throughout the migration.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Static site framework | [Astro](https://astro.build) 6.x (SSG) |
| Interactive components | [Preact](https://preactjs.com) via `@astrojs/preact` |
| Styling | [Tailwind CSS](https://tailwindcss.com) 4.x with `@tailwindcss/typography` |
| Content source | [Payload CMS](https://payloadcms.com) REST API |
| Deployment | [Cloudflare Workers](https://developers.cloudflare.com/workers/) (static assets) |
| CI/CD | GitHub Actions |
| Fonts | [Fontsource](https://fontsource.org) — Fraunces (headers), Source Sans 3 (body) |
| Accessibility | [pa11y](https://pa11y.org) (WCAG 2.1 AA enforcement in CI) |
| Node.js | Latest LTS (24.x) |

## Project Structure

```
src/
  components/     # Astro components (SEO, Footer, PhotoModal, etc.)
  data/           # Static data (navbar, social links, featured tags, etc.)
  islands/        # Preact interactive islands (HeaderNav)
  layouts/        # Page layouts (BaseLayout, ContentWrapper, LandingPage)
  lib/            # Payload CMS REST API client
  pages/          # File-based routing (posts, notes, photos, tags, feeds, etc.)
  styles/         # Global CSS with Tailwind theme and brand tokens
  types/          # TypeScript type definitions for CMS data
public/
  assets/         # Client-side JS (photo gallery, search) and feed stylesheet
cloudflare-workers/
  content-relay/  # KV cache relay for CMS content
  hi-redirector/  # Short URL redirect service (hi.edwardjensen.net)
  maps-proxy/     # Google Maps Static API proxy
  stream-proxy/   # Cloudflare Stream embed proxy
scripts/          # Accessibility testing (pa11y)
.github/workflows/  # CI/CD pipelines
```

## Content Architecture

All content is managed in Payload CMS and fetched via its REST API at build time. The API client in `src/lib/payload.ts` auto-paginates and caches results for the duration of the build.

**Content types:** Blog posts, working notes, photography (with EXIF/location data), historic posts (legacy archive), and CMS-managed pages.

**URL patterns are preserved** from the previous Jekyll site — posts at `/posts/YYYY/YYYY-MM/slug`, notes at `/notes/YYYY-MM-DD/slug`, photos at `/photos/YYYY/YYYY-MM/slug`, etc.

## Features

- **Photo gallery** with URL-routed modal, EXIF metadata, Google Maps integration, keyboard navigation
- **Client-side search** using Lunr.js with a build-time search index
- **RSS and JSON feeds** — main feed, per-tag feeds, notes feed, essays feed
- **Dark mode** via system preference detection
- **Pagination** for working notes and photography
- **Embedded content** — blog posts can embed working notes inline
- **Responsive navigation** with Preact island (sticky header, mobile accordion menu)
- **Build metadata** in footer (commit, version, environment badge)
- **Accessibility** — semantic HTML, skip links, focus management, WCAG 2.1 AA automated testing

## Local Development

**Prerequisites:** Node.js 24.x LTS, [Tailscale](https://tailscale.com) VPN connected (for CMS access).

```sh
# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your CMS URL

# Start dev server
npm run dev
```

### Commands

| Command | Action |
| :--- | :--- |
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Build production site to `dist/` |
| `npm run preview` | Preview built site locally |
| `npm run a11y` | Run pa11y accessibility checks against local dev server |
| `npm run a11y:report` | Generate full accessibility report (JSON) |

## Deployment

The site deploys to **Cloudflare Workers** (not Pages) via GitHub Actions:

- **PR checks** — build validation and accessibility testing as a required merge gate
- **Staging** — push to `main` deploys to a staging worker
- **Production** — push a version tag (`vX.Y.Z`) deploys to production
- **CMS republish** — webhook triggers rebuild from the latest production tag with fresh CMS content

All secrets (Cloudflare API tokens, CMS URLs, Tailscale credentials) are managed via GitHub Actions secrets — nothing is committed to the repository.

## Cloudflare Workers

Four supporting workers run alongside the main site:

| Worker | Domain | Purpose |
|--------|--------|---------|
| Content relay | `contentrelay.edwardjensen.net` | KV cache relay for CMS API responses |
| Hi redirector | `hi.edwardjensen.net` | Short URL redirect service |
| Maps proxy | `ejnetmaps.edwardjensenprojects.com` | Google Maps Static API proxy (keeps API key server-side) |
| Stream proxy | `stpcamera.edwardjensenprojects.com` | Cloudflare Stream embed proxy |

## Documentation

See [`docs/`](docs/) for architecture details, design system reference, and environment configuration.

## AI-Assisted Development

This site was migrated from Jekyll to Astro using GitHub Copilot agents. The migration planning documents (in `contexts/`, gitignored) guided the AI through a phased approach. The `.github/copilot-instructions.md` file provides context for ongoing AI-assisted development.

## License

Content is copyright Edward Jensen. Code structure and patterns are available for reference.
