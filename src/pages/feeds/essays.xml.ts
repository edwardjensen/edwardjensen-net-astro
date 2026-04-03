/**
 * Essays RSS feed — /feeds/essays.xml
 * Posts in the "essays" category, limit 10.
 */

import type { APIRoute } from "astro";
import { getPosts, postPath } from "../../lib/payload";

const SITE_URL = "https://www.edwardjensen.net";
const AUTHOR = "Edward Jensen";
const TITLE = "Edward Jensen - essays";
const DESCRIPTION =
  "Edward Jensen is a nonprofit technology professional who writes about the intersection of technology and mission-driven impact work. - Posts in category: essays";
const FEED_LIMIT = 10;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

export const GET: APIRoute = async () => {
  const posts = await getPosts();

  const sorted = [...posts]
    .filter(
      (p) =>
        p._status === "published" &&
        p.categories?.map((c) => c.toLowerCase()).includes("essays")
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT);

  const items = sorted
    .map((post) => {
      const url = `${SITE_URL}${postPath(post.slug, post.date)}`;
      const contentHtml = escapeXml(post.excerpt ?? "");
      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${toRfc822(post.date)}</pubDate>
      <author>${escapeXml(AUTHOR)}</author>
      <description>${contentHtml}</description>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/assets/css/feed-style.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(TITLE)}</title>
    <link>${SITE_URL}/writing/</link>
    <description>${escapeXml(DESCRIPTION)}</description>
    <language>en-US</language>
    <atom:link href="${SITE_URL}/feeds/essays.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${toRfc822(new Date().toISOString())}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
