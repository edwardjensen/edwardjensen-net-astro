/**
 * hi.edwardjensen.net Redirect Worker
 *
 * Handles short URL redirects with UTM tracking for analytics.
 * Serves at hi.edwardjensen.net with the following routes:
 *   - /              → Redirect to main site /hi page
 *   - /events.json   → JSON API with events data
 *   - /{platform}    → Social platform redirects with UTM params
 *   - /{tag}         → Event redirects with UTM params
 *   - /*             → Catch-all redirect to main site /hi page
 *
 * The hi-redirects.json config file is fetched from the CMS and written to
 * this directory by the deploy-hi-redirector.yml workflow before deploying.
 * It is not committed to the repository.
 */

import redirects from './hi-redirects.json';

// Build lookup maps for O(1) path matching
const socialMap = new Map(
  redirects.social.map(s => [s.platform.toLowerCase(), s])
);
const eventMap = new Map(
  redirects.events.map(e => [e.tag.toLowerCase(), e])
);

/**
 * Build a redirect URL with UTM parameters
 */
function buildRedirectUrl(baseUrl, source, medium, campaign) {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', source.toLowerCase());
  url.searchParams.set('utm_medium', medium.toLowerCase());
  url.searchParams.set('utm_campaign', campaign.toLowerCase());
  return url.toString();
}

/**
 * Create a 302 redirect response
 */
function redirectResponse(location) {
  return new Response(null, {
    status: 302,
    headers: { 'Location': location },
  });
}

/**
 * Create a JSON response with CORS headers
 */
function jsonResponse(data) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // Handle CORS preflight for /events.json
    if (request.method === 'OPTIONS' && path === '/events.json') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Route: Root redirect
    if (path === '/') {
      return redirectResponse(redirects.baseUrl);
    }

    // Route: Events JSON API
    if (path === '/events.json') {
      return jsonResponse({ events: redirects.events });
    }

    // Extract path segment (remove leading slash)
    const segment = path.slice(1);

    // Route: Social platform redirect
    const socialEntry = socialMap.get(segment);
    if (socialEntry) {
      const redirectUrl = buildRedirectUrl(
        redirects.baseUrl,
        socialEntry.platform,
        'social',
        'social'
      );
      return redirectResponse(redirectUrl);
    }

    // Route: Event redirect
    const eventEntry = eventMap.get(segment);
    if (eventEntry) {
      const redirectUrl = buildRedirectUrl(
        redirects.baseUrl,
        eventEntry.event,
        eventEntry.type,
        eventEntry.tag
      );
      return redirectResponse(redirectUrl);
    }

    // Catch-all: Redirect to base URL
    return redirectResponse(redirects.baseUrl);
  },
};
