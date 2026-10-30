/**
 * Payload CMS REST API client.
 *
 * Fetches all content at build time from the Cloudflare KV relay worker.
 * Base URL is set via CONTENT_RELAY_URL env var (no trailing slash, no /v2).
 * Read access is authenticated via CONTENT_RELAY_READ_KEY env var (X-Read-Key header).
 * The same client reads any source that serves the /v2 contract (the relay, or a CMS's own
 * /api/v2): choose it with an Astro mode (docs/environment.md).
 *
 * Each exported function returns all documents (auto-paginates).
 * A missing optional collection (see getHiEvents) yields an empty list instead of an error.
 * A required collection that comes back empty fails the build (CONTENT_ALLOW_EMPTY=1 allows it).
 * Results are cached in-memory for the duration of the build; under `astro dev` the cache
 * expires after a few seconds so edits in the CMS show on the next reload.
 */

import type {
  PayloadPost,
  PayloadWorkingNote,
  PayloadPhoto,
  PayloadHistoricPost,
  PayloadPage,
  PayloadHiEvent,
  PayloadListResponse,
} from "../types/payload.ts";

const PAGE_LIMIT = 100;

// Retry configuration for relay fetches.
// The wait-for-relay gate in republish-prod.yml handles the primary KV consistency window,
// but retries here provide a defense-in-depth backstop for transient errors.
const MAX_FETCH_RETRIES = 5;
const FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

// Each attempt gives up after this long, so a hung connection is retried instead of stalling the
// build. CONTENT_FETCH_TIMEOUT_MS overrides it (import.meta.env values are always strings).
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

// Under `astro dev` a cached collection is reused for this long, so edits show on a reload
// while the several calls that make up one page render still share a single fetch.
const DEV_CACHE_TTL_MS = 5_000;

/** The relay answered 404 for a collection that was fetched as optional. */
export class RelayNotFoundError extends Error {
  constructor(endpoint: string) {
    super(`The content relay has no '${endpoint}' collection`);
    this.name = "RelayNotFoundError";
  }
}

function getBaseUrl(): string {
  const url = import.meta.env.CONTENT_RELAY_URL;
  if (!url) {
    throw new Error(
      "CONTENT_RELAY_URL environment variable is not set. " +
        "Set it in .env.local for local development, or run a content-source mode " +
        "(for example npm run dev:production-relay, see docs/environment.md)."
    );
  }
  return url.replace(/\/$/, "") + "/v2";
}

function getFetchTimeoutMs(): number {
  const parsed = Number(import.meta.env.CONTENT_FETCH_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FETCH_TIMEOUT_MS;
}

function allowEmpty(): boolean {
  return import.meta.env.CONTENT_ALLOW_EMPTY === "1";
}

let _sourceLogged = false;

/** Say once which source this build reads, so a wrong mode is visible in the log. */
function logSource(baseUrl: string, hasKey: boolean): void {
  if (_sourceLogged) return;
  _sourceLogged = true;
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    // Not a URL: show it as given, the fetch will fail with a clearer message.
  }
  console.info(
    `[payload] Content source: ${host} (mode ${import.meta.env.MODE}, read key ${hasKey ? "set" : "not set"})`
  );
}

function getReadKey(): string | undefined {
  const key = import.meta.env.CONTENT_RELAY_READ_KEY;
  if (!key) {
    console.warn(
      "[payload] CONTENT_RELAY_READ_KEY is not set — requests to the relay will be unauthenticated and may be rejected."
    );
  }
  return key || undefined;
}

async function fetchPage<T>(
  endpoint: string,
  page: number,
  optional = false
): Promise<PayloadListResponse<T>> {
  const baseUrl = getBaseUrl();
  const readKey = getReadKey();
  logSource(baseUrl, Boolean(readKey));
  const url = `${baseUrl}/${endpoint}?page=${page}&limit=${PAGE_LIMIT}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (readKey) {
    headers["X-Read-Key"] = readKey;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_FETCH_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(getFetchTimeoutMs()),
      });

      if (response.ok) {
        return response.json() as Promise<PayloadListResponse<T>>;
      }

      // An optional collection that has not been pushed yet is not a transient error:
      // retrying for half a minute would only delay the same answer.
      if (optional && response.status === 404) {
        throw new RelayNotFoundError(endpoint);
      }

      lastError = new Error(
        `Payload CMS REST API request failed: ${response.status} ${response.statusText} (${url})`
      );
      console.warn(
        `[payload] Fetch attempt ${attempt}/${MAX_FETCH_RETRIES} failed: ${response.status} ${response.statusText} (${url})`
      );
    } catch (err) {
      if (err instanceof RelayNotFoundError) throw err;
      lastError = err;
      console.warn(
        `[payload] Fetch attempt ${attempt}/${MAX_FETCH_RETRIES} network error for ${url}: ${err}`
      );
    }

    if (attempt < MAX_FETCH_RETRIES) {
      await new Promise((resolve) =>
        setTimeout(resolve, FETCH_RETRY_DELAYS_MS[attempt - 1])
      );
    }
  }

  throw lastError;
}

async function fetchAll<T>(endpoint: string, optional = false): Promise<T[]> {
  const allDocs: T[] = [];
  let page = 1;

  do {
    const result = await fetchPage<T>(endpoint, page, optional);
    allDocs.push(...result.docs);
    if (!result.hasNextPage) break;
    page++;
  } while (true);

  return allDocs;
}

// Module-level cache of in-flight and finished fetches, keyed by collection name. A build keeps
// an entry for the whole process; `astro dev` drops it after DEV_CACHE_TTL_MS. Caching the
// promise means concurrent callers share one fetch, and a failure is not kept.
const _cache = new Map<string, { docs: Promise<unknown[]>; fetchedAt: number }>();

async function loadCollection<T>(endpoint: string, optional: boolean): Promise<T[]> {
  let docs: T[];
  try {
    docs = await fetchAll<T>(endpoint, optional);
  } catch (err) {
    if (!(err instanceof RelayNotFoundError)) throw err;
    console.warn(
      `[payload] ${err.message}; building without it. It appears once the CMS pushes it.`
    );
    return [];
  }
  // A reachable source with nothing in a required collection is almost always the wrong source
  // (a fresh CMS, or a wrong URL), and would build a site with no content and no error.
  if (docs.length === 0 && !optional && !allowEmpty()) {
    throw new Error(
      `The content source returned no documents for '${endpoint}'. ` +
        "Check CONTENT_RELAY_URL, or set CONTENT_ALLOW_EMPTY=1 for a CMS that is meant to be empty."
    );
  }
  return docs;
}

async function getCollection<T>(endpoint: string, optional = false): Promise<T[]> {
  const cached = _cache.get(endpoint);
  if (cached && !(import.meta.env.DEV && Date.now() - cached.fetchedAt > DEV_CACHE_TTL_MS)) {
    return cached.docs as Promise<T[]>;
  }
  const docs = loadCollection<T>(endpoint, optional);
  _cache.set(endpoint, { docs, fetchedAt: Date.now() });
  docs.catch(() => {
    if (_cache.get(endpoint)?.docs === docs) _cache.delete(endpoint);
  });
  return docs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all published blog posts. */
export async function getPosts(): Promise<PayloadPost[]> {
  return getCollection<PayloadPost>("posts");
}

/** Fetch all published working notes. */
export async function getWorkingNotes(): Promise<PayloadWorkingNote[]> {
  return getCollection<PayloadWorkingNote>("working-notes");
}

/** Fetch all published photography entries. */
export async function getPhotography(): Promise<PayloadPhoto[]> {
  return getCollection<PayloadPhoto>("photography");
}

/** Fetch all published historic posts. */
export async function getHistoricPosts(): Promise<PayloadHistoricPost[]> {
  return getCollection<PayloadHistoricPost>("historic-posts");
}

/** Fetch all published CMS pages (/about, /about/uses, etc.). */
export async function getPages(): Promise<PayloadPage[]> {
  return getCollection<PayloadPage>("pages");
}

/**
 * Fetch the events that have their own /hi/{tag}/ page. Unlike the collections above this
 * one is optional: the relay has no `hi-events` key until the CMS has pushed it once (it
 * does so whenever the redirector settings are saved), and a build before then should
 * produce a site with no event pages rather than fail.
 */
export async function getHiEvents(): Promise<PayloadHiEvent[]> {
  return getCollection<PayloadHiEvent>("hi-events", true);
}

// ---------------------------------------------------------------------------
// Permalink helpers — mirrors payload_rest.rb generate_permalink()
// ---------------------------------------------------------------------------

/** Generate the URL path for a blog post. */
export function postPath(slug: string, date: string): string {
  const d = new Date(date);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `/posts/${year}/${year}-${month}/${slug}`;
}

/** Generate the URL path for a working note. */
export function workingNotePath(slug: string, date: string): string {
  const d = new Date(date);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `/notes/${year}-${month}-${day}/${slug}`;
}

/** Generate the URL path for a photography entry. */
export function photoPath(slug: string, date: string): string {
  const d = new Date(date);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `/photos/${year}/${year}-${month}/${slug}`;
}

/** Generate the URL path for a historic post. */
export function historicPostPath(slug: string): string {
  return `/archive/posts/${slug}`;
}
