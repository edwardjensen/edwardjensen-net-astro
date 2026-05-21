/**
 * Essays RSS feed — /feeds/essays.xml
 * Posts in the "essays" category, limit 10.
 */

import type { APIRoute } from "astro";
import { getPosts, postPath } from "../../lib/payload";
import { escapeXml, toRfc822, rssHeader, rssFooter } from "../../lib/feed-utils";
import {
  SITE_URL,
  SITE_TITLE,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  FEED_LIMIT_POSTS,
} from "../../config";

const TITLE = `${SITE_TITLE} - essays`;
const DESCRIPTION = `${SITE_DESCRIPTION} - Posts in category: essays`;

export const GET: APIRoute = async () => {
  const posts = await getPosts();

  const sorted = [...posts]
    .filter(
      (p) =>
        p._status === "published" &&
        p.categories?.map((c) => c.toLowerCase()).includes("essays")
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT_POSTS);

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
      <author>${escapeXml(SITE_AUTHOR)}</author>
      <description>${contentHtml}</description>
    </item>`;
    })
    .join("");

  const xml = `${rssHeader({
    title: TITLE,
    description: DESCRIPTION,
    linkUrl: `${SITE_URL}/writing/`,
    feedUrl: `${SITE_URL}/feeds/essays.xml`,
  })}
    ${items}
  ${rssFooter()}`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
