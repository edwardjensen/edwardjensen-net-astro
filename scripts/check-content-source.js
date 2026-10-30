#!/usr/bin/env node
// Content source check
// Reads every collection from the configured content source (the relay, or a CMS's own /api/v2)
// and checks that it has the shape the site relies on. Run it before a build, or after pointing
// at a new source: it fails fast with a list of what is wrong instead of a half-built site.
//
//   npm run check:source                      uses the environment and .env.local
//   npm run check:source -- --mode staging-relay   also loads .env.staging-relay[.local]
//
// Uses CONTENT_RELAY_URL, CONTENT_RELAY_READ_KEY and CONTENT_ALLOW_EMPTY like the build does
// (variables already in the environment win over .env files, as in Astro).
// The required fields below mirror src/types/payload.ts; keep them in step when it changes.

import { loadEnv } from "vite";

const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex === -1 ? "development" : process.argv[modeIndex + 1];
if (!mode) {
  console.error("--mode needs a value");
  process.exit(2);
}
const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };

const PAGE_LIMIT = 100;
const TIMEOUT_MS = 30_000;
const ATTEMPTS = 3;

// Field name -> expected type. "array" and "object" are told apart from typeof's "object".
const DATED = { id: "number", title: "string", slug: "string", date: "string", contentHtml: "string", sitemap: "boolean", updatedAt: "string" };
const ARTICLE = { ...DATED, tags: "array", categories: "array", redirectFrom: "array" };

const COLLECTIONS = [
  { name: "posts", fields: ARTICLE },
  { name: "working-notes", fields: { ...DATED, tags: "array" } },
  { name: "photography", fields: { ...DATED, tags: "array", image: "object" } },
  { name: "historic-posts", fields: ARTICLE },
  { name: "pages", fields: { id: "number", title: "string", slug: "string", permalink: "string", contentHtml: "string", searchable: "boolean", sitemap: "boolean", redirectFrom: "array", updatedAt: "string" } },
  // Not a CMS collection: the relay has none until the CMS has pushed it, and the CMS's own API never does.
  { name: "hi-events", fields: { id: "string", tag: "string", event: "string" }, optional: true },
];

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

const rawUrl = env.CONTENT_RELAY_URL;
if (!rawUrl) {
  console.error("CONTENT_RELAY_URL is not set (see docs/environment.md).");
  process.exit(2);
}
const baseUrl = `${rawUrl.replace(/\/$/, "")}/v2`;
const key = env.CONTENT_RELAY_READ_KEY || undefined;
const allowEmpty = env.CONTENT_ALLOW_EMPTY === "1";

async function fetchPage(name, page) {
  const url = `${baseUrl}/${name}?page=${page}&limit=${PAGE_LIMIT}`;
  const headers = { Accept: "application/json", ...(key ? { "X-Read-Key": key } : {}) };
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return { status: res.status, body: await res.json() };
      if (res.status === 404 || res.status === 401 || res.status === 403) return { status: res.status };
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.name === "TimeoutError" ? `no answer in ${TIMEOUT_MS / 1000}s` : err.message;
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return { error: last };
}

async function checkCollection({ name, fields, optional }) {
  const problems = [];
  const docs = [];
  let totalDocs = null;
  for (let page = 1; ; page++) {
    const r = await fetchPage(name, page);
    if (r.error) return { name, problems: [`could not read it: ${r.error}`] };
    if (r.status === 404 && optional) return { name, note: "not present (optional)", problems };
    if (r.status === 401 || r.status === 403) return { name, problems: [`the source refused the read key (HTTP ${r.status})`] };
    if (r.status === 404) return { name, problems: ["the source has no such collection (HTTP 404)"] };
    const b = r.body;
    if (!b || !Array.isArray(b.docs) || typeof b.totalDocs !== "number" || typeof b.hasNextPage !== "boolean") {
      return { name, problems: ["the response is not a /v2 list (needs docs[], totalDocs, hasNextPage)"] };
    }
    totalDocs = b.totalDocs;
    docs.push(...b.docs);
    if (!b.hasNextPage) break;
  }

  if (docs.length !== totalDocs) problems.push(`listed ${docs.length} documents but totalDocs says ${totalDocs}`);
  if (docs.length === 0 && !optional && !allowEmpty) problems.push("it is empty (set CONTENT_ALLOW_EMPTY=1 if that is expected)");

  const ids = new Set();
  const wrong = new Map(); // "field (expected type)" -> count
  let drafts = 0;
  for (const doc of docs) {
    if (ids.has(doc.id)) problems.push(`duplicate id ${doc.id}`);
    ids.add(doc.id);
    if (doc._status === "draft") drafts++;
    for (const [field, expected] of Object.entries(fields)) {
      const actual = typeOf(doc[field]);
      if (actual !== expected) {
        const label = `${field}: expected ${expected}, got ${actual}`;
        wrong.set(label, (wrong.get(label) ?? 0) + 1);
      }
    }
    if (typeof doc.slug === "string" && doc.slug === "") problems.push(`document ${doc.id} has an empty slug`);
  }
  if (drafts > 0) problems.push(`${drafts} draft document(s): the site expects published content only`);
  for (const [label, count] of wrong) problems.push(`${label} (${count} document${count === 1 ? "" : "s"})`);
  return { name, count: docs.length, problems };
}

const host = (() => { try { return new URL(baseUrl).host; } catch { return baseUrl; } })();
console.log(`Checking ${host} (mode ${mode}, read key ${key ? "set" : "not set"})`);

let failed = false;
for (const collection of COLLECTIONS) {
  const result = await checkCollection(collection);
  const ok = result.problems.length === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${result.name.padEnd(15)} ${result.note ?? `${result.count ?? "-"} documents`}`);
  for (const p of result.problems.slice(0, 10)) console.log(`       - ${p}`);
  if (result.problems.length > 10) console.log(`       - …and ${result.problems.length - 10} more`);
}
process.exit(failed ? 1 : 0);
