/**
 * Cloudflare Stream Proxy Worker
 *
 * Proxies requests to Cloudflare Stream, hiding the customer and video IDs.
 * This keeps sensitive identifiers out of client-side code.
 *
 * Environment variables required:
 *   CLOUDFLARE_STREAM_CUSTOMER_ID - Your Cloudflare Stream customer ID
 *   CLOUDFLARE_STREAM_VIDEO_ID    - Your Cloudflare Stream video ID
 *
 * Usage:
 *   GET /iframe?autoplay=true&muted=true
 */

// Allowed origin patterns.
// Workers preview URLs (*.workers.dev) cover staging deployments.
const ALLOWED_ORIGINS = [
  /^https:\/\/([\w-]+\.)?edwardjensen\.net$/,
  /^https:\/\/([\w-]+\.)?edwardjensencms\.com$/,
  /^https:\/\/[\w-]+\.workers\.dev$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

/**
 * Check if the request origin is allowed
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

  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!isOriginAllowed(request)) {
      return new Response('Forbidden', { status: 403 });
    }

    const origin = request.headers.get('Origin') || '*';
    const corsOrigin = ALLOWED_ORIGINS.some(pattern => pattern.test(origin)) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': corsOrigin || '',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    if (url.pathname !== '/iframe') {
      return new Response('Not Found', { status: 404 });
    }

    if (!env.CLOUDFLARE_STREAM_CUSTOMER_ID) {
      console.error('CLOUDFLARE_STREAM_CUSTOMER_ID environment variable not set');
      return new Response('Server configuration error', { status: 500 });
    }
    if (!env.CLOUDFLARE_STREAM_VIDEO_ID) {
      console.error('CLOUDFLARE_STREAM_VIDEO_ID environment variable not set');
      return new Response('Server configuration error', { status: 500 });
    }

    const streamUrl = new URL(
      `https://customer-${env.CLOUDFLARE_STREAM_CUSTOMER_ID}.cloudflarestream.com/${env.CLOUDFLARE_STREAM_VIDEO_ID}/iframe`
    );

    // Allowlist specific params to prevent abuse
    const allowedParams = [
      'autoplay', 'muted', 'preload', 'loop', 'controls',
      'poster', 'startTime', 'defaultTextTrack',
    ];
    const params = url.searchParams;
    for (const param of allowedParams) {
      if (params.has(param)) {
        streamUrl.searchParams.set(param, params.get(param));
      }
    }

    return Response.redirect(streamUrl.toString(), 302);
  },
};
