/**
 * Main JSON Feed — /feed.json
 * All posts, limit 10, JSON Feed 1.1 format.
 */

import type { APIRoute } from "astro";
import { getPosts, postPath } from "../lib/payload";
import { footerText } from "../data/footer-text";

const SITE_URL = "https://www.edwardjensen.net";
const AUTHOR = "Edward Jensen";
const FEED_LIMIT = 10;

export const GET: APIRoute = async () => {
  const posts = await getPosts();

  const sorted = [...posts]
    .filter((p) => p._status === "published")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT);

  const items = sorted.map((post) => {
    const url = `${SITE_URL}${postPath(post.slug, post.date)}`;
    const imageHtml =
      post.showImage && post.image
        ? `<img src="${post.image.url}" alt="${post.title}">`
        : "";
    const contentHtml =
      imageHtml + (post.excerpt ?? "") + `<p>${footerText.feed_footer_text}</p>`;

    const item: Record<string, unknown> = {
      id: url,
      url,
      title: post.title,
      content_html: contentHtml,
      summary: post.excerpt
        ? post.excerpt.replace(/<[^>]+>/g, "").trim()
        : undefined,
      date_published: new Date(post.date).toISOString(),
      date_modified: new Date(post.updatedAt).toISOString(),
    };
    if (post.image) item["image"] = post.image.url;
    if (post.tags?.length) item["tags"] = post.tags;
    return item;
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: "Edward Jensen",
    description:
      "Edward Jensen is a nonprofit technology professional who writes about the intersection of technology and mission-driven impact work.",
    home_page_url: `${SITE_URL}/`,
    feed_url: `${SITE_URL}/feed.json`,
    favicon: `${SITE_URL}/favicon.ico`,
    expired: false,
    language: "en-US",
    authors: [{ name: AUTHOR, url: SITE_URL }],
    items,
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { "Content-Type": "application/feed+json; charset=utf-8" },
  });
};
