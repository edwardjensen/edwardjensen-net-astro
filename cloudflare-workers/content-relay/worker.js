/**
 * Content Relay Worker
 *
 * Serves Payload CMS REST API responses from Cloudflare KV storage.
 * Content is written to KV by the relay refresh script
 * (scripts/refresh-content-relay.js), which fetches from the CMS directly
 * via Tailscale VPN in CI.
 *
 * This is a read-only relay for build-time content fetching. It serves
 * pre-cached snapshots that are refreshed on each CMS content publish event.
 *
 * GraphQL support has been removed. The relay serves v2 REST responses only.
 *
 * Environment bindings:
 *   GRAPHQL_CACHE   - KV namespace for cached data (binding name unchanged for
 *                     backward compatibility with existing KV namespace)
 *   CONTENT_RELAY_API_KEY - Secret API key for write operations
 *                           (set via: wrangler secret put CONTENT_RELAY_API_KEY)
 *
 * Endpoints:
 *   GET  /v2/:collection          - List all documents (paginated)
 *   GET  /v2/:collection/:id      - Get single document by ID
 *   POST /v2/refresh/:collection  - Write collection data (requires CONTENT_RELAY_API_KEY)
 *   GET  /config/:key             - Read configuration
 *   POST /config/:key             - Write configuration (requires CONTENT_RELAY_API_KEY)
 *   GET  /status                  - Cache status and metadata
 *   GET  /health                  - Health check
 */

// Allowed origin patterns for read operations.
// Workers preview URLs (*.workers.dev) are allowed in addition to the
// production domain and local development.
const ALLOWED_ORIGINS = [
  /^https:\/\/([\w-]+\.)?edwardjensen\.net$/,
  /^https:\/\/([\w-]+\.)?edwardjensencms\.com$/,
  /^https:\/\/[\w-]+\.workers\.dev$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

/**
 * Check if origin is allowed for read operations.
 * Requests without an Origin or Referer header are allowed
 * (e.g. GitHub Actions runners, curl).
 */
function isOriginAllowed(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  if (origin) {
    return ALLOWED_ORIGINS.some(pattern => pattern.test(origin));
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return ALLOWED_ORIGINS.some(pattern => pattern.test(refererUrl.origin));
    } catch {
      return false;
    }
  }

  // Allow headerless requests (CI/CD, curl)
  return true;
}

/**
 * Validate the write API key from the Authorization header.
 */
function isWriteApiKeyValid(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  return authHeader.slice(7) === env.CONTENT_RELAY_API_KEY;
}

function getV2CollectionKey(collection) {
  return `v2:${collection}`;
}

function getV2DocumentKey(collection, id) {
  return `v2:${collection}:${id}`;
}

function getMetadataKey(key) {
  return `metadata:${key}`;
}

function getConfigKey(key) {
  return `config:${key}`;
}

function jsonResponse(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
    },
  });
}

function handleCors(request) {
  const origin = request.headers.get('Origin') || '*';
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return handleCors(request);
    }

    // Health check
    if (path === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Status — shows cache metadata for all v2 collections
    if (path === '/status' && request.method === 'GET') {
      const v2Collections = [
        'posts',
        'working-notes',
        'photography',
        'historic-posts',
        'pages',
      ];
      const statusV2 = {};
      for (const collection of v2Collections) {
        const metadata = await env.GRAPHQL_CACHE.get(
          getMetadataKey(`v2:${collection}`),
          'json'
        );
        if (metadata) {
          statusV2[collection] = metadata;
        }
      }
      return jsonResponse({
        v2: { collections: statusV2 },
        timestamp: new Date().toISOString(),
      });
    }

    // Config read: GET /config/:key
    const configMatch = path.match(/^\/config\/(\w+)$/);
    if (configMatch && request.method === 'GET') {
      const key = configMatch[1];
      const data = await env.GRAPHQL_CACHE.get(getConfigKey(key), 'json');
      if (!data) {
        return jsonResponse(
          { error: `No configuration found for key: ${key}` },
          404,
          origin
        );
      }
      return jsonResponse({ key, data }, 200, origin);
    }

    // Config write: POST /config/:key
    if (configMatch && request.method === 'POST') {
      if (!isWriteApiKeyValid(request, env)) {
        return jsonResponse({ error: 'Unauthorized - valid CONTENT_RELAY_API_KEY required' }, 401, origin);
      }
      try {
        const body = await request.json();
        if (!body.data) {
          return jsonResponse(
            { error: 'Request body must contain "data" field' },
            400,
            origin
          );
        }
        await env.GRAPHQL_CACHE.put(getConfigKey(configMatch[1]), JSON.stringify(body.data));
        return jsonResponse({
          success: true,
          key: configMatch[1],
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return jsonResponse(
          { error: 'Failed to store configuration', details: error.message },
          500,
          origin
        );
      }
    }

    if (configMatch) {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    // v2 list: GET /v2/:collection
    const v2ListMatch = path.match(/^\/v2\/([a-z-]+)$/);
    if (v2ListMatch && request.method === 'GET') {
      const collection = v2ListMatch[1];
      if (!isOriginAllowed(request)) {
        return jsonResponse({ error: 'Unauthorized - origin not allowed' }, 401, origin);
      }
      try {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
        const limit = Math.min(
          100,
          Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10))
        );

        const data = await env.GRAPHQL_CACHE.get(getV2CollectionKey(collection), 'json');
        if (!data) {
          return jsonResponse(
            {
              error: `No cached data for collection: ${collection}`,
              hint: 'Cache may need to be refreshed',
            },
            404,
            origin
          );
        }

        const totalDocs = data.totalDocs || data.docs?.length || 0;
        const totalPages = Math.ceil(totalDocs / limit);
        const startIndex = (page - 1) * limit;
        const paginatedDocs = (data.docs || []).slice(startIndex, startIndex + limit);

        return jsonResponse(
          {
            docs: paginatedDocs,
            totalDocs,
            totalPages,
            page,
            limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
          200,
          origin
        );
      } catch (error) {
        return jsonResponse(
          { error: 'Failed to process request', details: error.message },
          500,
          origin
        );
      }
    }

    // v2 single document: GET /v2/:collection/:id
    const v2SingleMatch = path.match(/^\/v2\/([a-z-]+)\/(\d+)$/);
    if (v2SingleMatch && request.method === 'GET') {
      const [, collection, id] = v2SingleMatch;
      if (!isOriginAllowed(request)) {
        return jsonResponse({ error: 'Unauthorized - origin not allowed' }, 401, origin);
      }
      try {
        const data = await env.GRAPHQL_CACHE.get(
          getV2DocumentKey(collection, id),
          'json'
        );
        if (!data) {
          return jsonResponse(
            { error: `Document not found: ${collection}/${id}` },
            404,
            origin
          );
        }
        return jsonResponse(data, 200, origin);
      } catch (error) {
        return jsonResponse(
          { error: 'Failed to process request', details: error.message },
          500,
          origin
        );
      }
    }

    // v2 refresh: POST /v2/refresh/:collection
    const v2RefreshMatch = path.match(/^\/v2\/refresh\/([a-z-]+)$/);
    if (v2RefreshMatch && request.method === 'POST') {
      const collection = v2RefreshMatch[1];
      if (!isWriteApiKeyValid(request, env)) {
        return jsonResponse({ error: 'Unauthorized - valid CONTENT_RELAY_API_KEY required' }, 401, origin);
      }
      try {
        const body = await request.json();
        if (!body.data || !body.data.docs) {
          return jsonResponse(
            { error: 'Request body must contain "data.docs" field' },
            400,
            origin
          );
        }

        const { docs } = body.data;

        // Store the full collection for the list endpoint
        await env.GRAPHQL_CACHE.put(
          getV2CollectionKey(collection),
          JSON.stringify(body.data)
        );

        // Store individual documents for the single-document endpoint
        const writePromises = docs
          .filter(doc => doc.id)
          .map(doc =>
            env.GRAPHQL_CACHE.put(
              getV2DocumentKey(collection, doc.id),
              JSON.stringify(doc)
            )
          );
        await Promise.all(writePromises);

        const metadata = {
          cached: true,
          updatedAt: new Date().toISOString(),
          docCount: docs.length,
          totalDocs: body.data.totalDocs || docs.length,
          version: 'v2',
        };
        await env.GRAPHQL_CACHE.put(
          getMetadataKey(`v2:${collection}`),
          JSON.stringify(metadata)
        );

        return jsonResponse({ success: true, collection, metadata });
      } catch (error) {
        return jsonResponse(
          { error: 'Failed to store cache data', details: error.message },
          500,
          origin
        );
      }
    }

    // 404 — list available endpoints
    return jsonResponse(
      {
        error: 'Not found',
        availableEndpoints: [
          'GET /health',
          'GET /status',
          'GET /config/:key',
          'POST /config/:key',
          'GET /v2/:collection',
          'GET /v2/:collection/:id',
          'POST /v2/refresh/:collection',
        ],
      },
      404,
      origin
    );
  },
};
