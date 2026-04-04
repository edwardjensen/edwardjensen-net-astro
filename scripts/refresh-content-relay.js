#!/usr/bin/env node
/**
 * Content Relay Refresh Script
 *
 * Fetches all content from the Payload CMS REST API (accessible via Tailscale
 * VPN in CI) and writes it to the Cloudflare KV content relay worker.
 *
 * This is the Node.js replacement for scripts/refresh-graphql-cache.ps1 in the
 * Jekyll project. GraphQL paths are intentionally absent — the relay serves
 * REST responses only.
 *
 * Usage:
 *   node scripts/refresh-content-relay.js
 *   node scripts/refresh-content-relay.js --collection posts
 *
 * Required environment variables:
 *   CMS_REST_URL          - Base URL of the Payload CMS REST API, no trailing slash
 *                           (e.g. https://www-ts.edwardjensencms.com/api/v2)
 *   CONTENT_RELAY_URL     - Base URL of the Cloudflare KV relay worker, no trailing slash
 *                           (e.g. https://contentrelay.edwardjensen.net)
 *   CONTENT_RELAY_API_KEY - API key for write operations on the relay worker
 */

const PAGE_LIMIT = 100;

// All collections served by the relay. Must match Payload CMS REST API paths.
const ALL_COLLECTIONS = [
  'posts',
  'working-notes',
  'photography',
  'historic-posts',
  'pages',
];

function getConfig() {
  const cmsRestUrl = process.env.CMS_REST_URL?.replace(/\/$/, '');
  const relayUrl = process.env.CONTENT_RELAY_URL?.replace(/\/$/, '');
  const relayApiKey = process.env.CONTENT_RELAY_API_KEY;

  const missing = [];
  if (!cmsRestUrl) missing.push('CMS_REST_URL');
  if (!relayUrl) missing.push('CONTENT_RELAY_URL');
  if (!relayApiKey) missing.push('CONTENT_RELAY_API_KEY');

  if (missing.length > 0) {
    console.error(`✗ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  return { cmsRestUrl, relayUrl, relayApiKey };
}

/**
 * Fetch all documents for a collection from the CMS, auto-paginating.
 */
async function fetchAllFromCms(cmsRestUrl, collection) {
  const allDocs = [];
  let page = 1;
  let totalDocs = 0;

  while (true) {
    const url = `${cmsRestUrl}/${collection}?page=${page}&limit=${PAGE_LIMIT}`;
    console.log(`  Fetching page ${page}: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `CMS returned ${response.status} ${response.statusText} for ${url}`
      );
    }

    const data = await response.json();
    allDocs.push(...data.docs);
    totalDocs = data.totalDocs ?? allDocs.length;

    console.log(
      `  Page ${page}: ${data.docs.length} docs (${allDocs.length}/${totalDocs} total)`
    );

    if (!data.hasNextPage) break;
    page++;
  }

  return { allDocs, totalDocs };
}

/**
 * Write a collection's documents to the content relay.
 */
async function writeToRelay(relayUrl, relayApiKey, collection, allDocs, totalDocs) {
  const url = `${relayUrl}/v2/refresh/${collection}`;
  const payload = {
    data: {
      docs: allDocs,
      totalDocs,
      totalPages: 1,
      page: 1,
      limit: totalDocs,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };

  console.log(`  Writing ${allDocs.length} docs to relay: POST ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${relayApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Relay returned ${response.status} ${response.statusText}: ${body}`
    );
  }

  const result = await response.json();
  const docCount = result.metadata?.docCount ?? allDocs.length;
  console.log(`  ✓ Relay acknowledged: ${docCount} docs cached`);
}

/**
 * Refresh a single collection.
 */
async function refreshCollection(cmsRestUrl, relayUrl, relayApiKey, collection) {
  console.log(`\nRefreshing collection: ${collection}`);
  const { allDocs, totalDocs } = await fetchAllFromCms(cmsRestUrl, collection);
  await writeToRelay(relayUrl, relayApiKey, collection, allDocs, totalDocs);
  console.log(`  Done: ${totalDocs} docs`);
}

async function main() {
  const { cmsRestUrl, relayUrl, relayApiKey } = getConfig();

  // Parse optional --collection <name> argument
  const collectionArgIndex = process.argv.indexOf('--collection');
  const collections =
    collectionArgIndex !== -1 && process.argv[collectionArgIndex + 1]
      ? [process.argv[collectionArgIndex + 1]]
      : ALL_COLLECTIONS;

  const unknownCollections = collections.filter(c => !ALL_COLLECTIONS.includes(c));
  if (unknownCollections.length > 0) {
    console.error(`✗ Unknown collection(s): ${unknownCollections.join(', ')}`);
    console.error(`  Valid collections: ${ALL_COLLECTIONS.join(', ')}`);
    process.exit(1);
  }

  console.log('Content Relay Refresh');
  console.log(`CMS:         ${cmsRestUrl}`);
  console.log(`Relay:       ${relayUrl}`);
  console.log(`Collections: ${collections.join(', ')}`);

  let errors = 0;
  for (const collection of collections) {
    try {
      await refreshCollection(cmsRestUrl, relayUrl, relayApiKey, collection);
    } catch (err) {
      console.error(`\n✗ Failed to refresh ${collection}: ${err.message}`);
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} collection(s) failed to refresh.`);
    process.exit(1);
  }

  console.log(`\n✓ All ${collections.length} collection(s) refreshed successfully.`);
}

main();
