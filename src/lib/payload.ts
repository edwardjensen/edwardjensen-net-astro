/**
 * Payload CMS REST API client.
 *
 * Fetches all content at build time from the cache worker.
 * Base URL is set via CONTENT_RELAY_URL env var (no trailing slash, no /v2).
 * Optional auth via REST_API_KEY env var.
 *
 * Each exported function returns all documents (auto-paginates).
 * Results are cached in-memory for the duration of the build.
 */

import type {
  PayloadPost,
  PayloadWorkingNote,
  PayloadPhoto,
  PayloadHistoricPost,
  PayloadPage,
  PayloadListResponse,
} from "../types/payload.ts";

const PAGE_LIMIT = 100;

function getBaseUrl(): string {
  const url = import.meta.env.CONTENT_RELAY_URL;
  if (!url) {
    throw new Error(
      "CONTENT_RELAY_URL environment variable is not set. " +
        "Set it in .env.local for local development."
    );
  }
  return url.replace(/\/$/, "") + "/v2";
}

function getApiKey(): string | undefined {
  return import.meta.env.REST_API_KEY || undefined;
}

async function fetchPage<T>(
  endpoint: string,
  page: number
): Promise<PayloadListResponse<T>> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const url = `${baseUrl}/${endpoint}?page=${page}&limit=${PAGE_LIMIT}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Payload CMS REST API request failed: ${response.status} ${response.statusText} (${url})`
    );
  }

  return response.json() as Promise<PayloadListResponse<T>>;
}

async function fetchAll<T>(endpoint: string): Promise<T[]> {
  const allDocs: T[] = [];
  let page = 1;

  do {
    const result = await fetchPage<T>(endpoint, page);
    allDocs.push(...result.docs);
    if (!result.hasNextPage) break;
    page++;
  } while (true);

  return allDocs;
}

// Module-level cache — persists for the entire build process.
// Keyed by collection name.
const _cache = new Map<string, unknown[]>();

async function getCollection<T>(endpoint: string): Promise<T[]> {
  if (_cache.has(endpoint)) {
    return _cache.get(endpoint) as T[];
  }
  const docs = await fetchAll<T>(endpoint);
  _cache.set(endpoint, docs);
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
