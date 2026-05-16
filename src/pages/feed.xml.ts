/**
 * Main RSS feed — /feed.xml
 * All posts, limit 10, newest first.
 */

import type { APIRoute } from "astro";
import { getPosts, postPath } from "../lib/payload";
import { footerText } from "../data/footer-text";
import { escapeXml, toRfc822, rssHeader, rssFooter } from "../lib/feed-utils";
import {
  SITE_URL,
  SITE_TITLE,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  FEED_LIMIT_POSTS,
} from "../config";

export const GET: APIRoute = async () => {
  const posts = await getPosts();

  const sorted = [...posts]
    .filter((p) => p._status === "published")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT_POSTS);

  const items = sorted
    .map((post) => {
      const url = `${SITE_URL}${postPath(post.slug, post.date)}`;
      const imageHtml =
        post.showImage && post.image
          ? `<img src="${escapeXml(post.image.url)}" alt="${escapeXml(post.title)}">`
          : "";
      const contentHtml = escapeXml(
        imageHtml +
          (post.excerpt ?? "") +
          `<p>${footerText.feed_footer_text}</p>`
      );
      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${toRfc822(post.date)}</pubDate>
      <author>${escapeXml(SITE_AUTHOR)}</author>
      <description>${contentHtml}</description>
      ${post.categories.map((c) => `<category>${escapeXml(c)}</category>`).join("\n      ")}
    </item>`;
    })
    .join("");

  const xml = `${rssHeader({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    linkUrl: `${SITE_URL}/`,
    feedUrl: `${SITE_URL}/feed.xml`,
  })}
    ${items}
  ${rssFooter()}`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
