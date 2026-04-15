# Architecture

## Overview

edwardjensen.net is a statically generated (SSG) Astro site. All content is fetched from Payload CMS via its REST API at build time, pre-rendered to HTML, and deployed to Cloudflare Workers as static assets.

Interactive features (navigation, photo gallery modal) are handled by Preact islands — small JavaScript components that hydrate on the client only where needed.

## Content Fetching

**Source:** Cloudflare KV content relay at `contentrelay.edwardjensen.net` (public, key-authenticated).

The API client lives in `src/lib/payload.ts`. Key aspects:

- **Auto-pagination:** Each collection fetcher loops through all pages (PAGE_LIMIT = 100 per request) until all documents are retrieved.
- **Build-time caching:** Module-level caches ensure each collection is fetched only once per build, even if multiple pages reference the same data.
- **Permalink helpers:** Functions like `postPath()`, `workingNotePath()`, `photoPath()` generate URL paths from document slugs and dates.
- **Environment config:** `CONTENT_RELAY_URL` env var points to the relay base URL. `CONTENT_RELAY_READ_KEY` is sent as the `X-Read-Key` header on all requests.

### Content Types

| Type | Collection Slug | URL Pattern |
|------|----------------|-------------|
| Blog posts | `posts` | `/posts/YYYY/YYYY-MM/slug` |
| Working notes | `working-notes` | `/notes/YYYY-MM-DD/slug` |
| Photography | `photography` | `/photos/YYYY/YYYY-MM/slug` |
| Historic posts | `historic-posts` | `/archive/posts/slug` |
| Pages | `pages` | `/slug` (catch-all route) |

### CMS Data Shape

TypeScript interfaces for all content types are defined in `src/types/payload.ts`. Key patterns:

- **Pre-rendered HTML:** The CMS provides `contentHtml` with rendered rich text.
- **Embedded notes:** Blog posts may contain `<!-- embed:ID -->` placeholders in their HTML, with corresponding `blocks` array entries. The page template resolves and inlines these.
- **Image metadata:** Featured images include `url`, `alt`, `width`, `height`.
- **EXIF data:** Photography entries include camera model, lens, aperture, shutter speed, ISO, focal length, and capture date.
- **Location data:** Photography entries may include latitude, longitude, location label, and precision level.

## Page Routing

Astro's file-based routing in `src/pages/`:

- **Dynamic routes** use `getStaticPaths()` to generate all pages at build time.
- **Catch-all routes** (`[...slug].astro`) handle CMS-managed pages and nested URL patterns.
- **Pagination** uses Astro's built-in pagination via `getStaticPaths()` with `paginate()`.

## Layouts

Three layout levels:

1. **BaseLayout** — HTML shell, `<head>`, SEO meta, skip link, header nav island, photo modal, footer.
2. **ContentWrapper** — Extends BaseLayout with standard article container styling.
3. **LandingPage** — Extends BaseLayout with a centered intro section and named `sections` slot.

## Interactive Islands

Preact components in `src/islands/` are hydrated on the client:

- **HeaderNav** (`client:load`) — Sticky header with scroll-hide, desktop dropdowns, mobile hamburger menu, keyboard support.

Vanilla JavaScript handles:

- **Photo gallery** (`public/assets/js/photo-gallery.js`) — Modal with URL routing, EXIF display, Google Maps, keyboard navigation, browser history.
- **Search** (`public/assets/js/search.js`) — Lunr.js client-side search against a build-time JSON index.

## Supporting Workers

Four Cloudflare Workers run alongside the main site, each in `cloudflare-workers/`:

- **content-relay** — KV-backed cache for CMS REST API responses. Provides public read access to content from a CMS on a private network.
- **hi-redirector** — Short URL redirect service. Fetches redirect mappings from a CMS globals endpoint.
- **maps-proxy** — Proxies Google Maps Static API requests, keeping the API key server-side.
- **stream-proxy** — Proxies Cloudflare Stream embeds.

## Build Pipeline

```
Payload CMS REST API
        │
        ▼
  src/lib/payload.ts  (fetch + cache all content)
        │
        ▼
  src/pages/*.astro   (generate static pages via getStaticPaths)
        │
        ▼
     dist/            (Astro build output)
        │
        ▼
  Cloudflare Workers  (wrangler deploy)
```

## Deployment Model

```
PR → build + a11y checks (required gate)
  │
  ▼
main → staging worker (automatic)
  │
  ▼
vX.Y.Z tag → production worker (www.edwardjensen.net)
  │
  ▼
CMS webhook → rebuild from latest tag with fresh content
```
