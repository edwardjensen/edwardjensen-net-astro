/**
 * Dynamic featured tag RSS feeds — /feeds/[tag].xml
 * One feed per featured tag, filtered posts.
 */

import type { APIRoute, GetStaticPaths } from "astro";
import { getPosts, postPath } from "../../lib/payload";
import { featuredTags } from "../../data/featured-tags";
import { footerText } from "../../data/footer-text";

const SITE_URL = "https://www.edwardjensen.net";
const AUTHOR = "Edward Jensen";
const FEED_LIMIT = 20;

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

export const getStaticPaths: GetStaticPaths = async () => {
  const allPosts = await getPosts();

  return featuredTags.map((tagDef) => {
    const filtered = allPosts
      .filter(
        (p) =>
          p._status === "published" && p.tags?.includes(tagDef.tag)
      )
      .sort((a, b) => {
        const diff =
          new Date(a.date).getTime() - new Date(b.date).getTime();
        return tagDef.sortAscending ? diff : -diff;
      })
      .slice(0, FEED_LIMIT);

    return {
      params: { tag: tagDef.tag },
      props: { tagDef, posts: filtered },
    };
  });
};

interface TagFeedProps {
  tagDef: (typeof import("../../data/featured-tags").featuredTags)[0];
  posts: Awaited<ReturnType<typeof import("../../lib/payload").getPosts>>;
}

export const GET: APIRoute = async ({ props }) => {
  const { tagDef, posts } = props as TagFeedProps;

  const items = posts
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
      <author>${escapeXml(AUTHOR)}</author>
      <description>${contentHtml}</description>
    </item>`;
    })
    .join("");

  const feedUrl = `${SITE_URL}/feeds/${tagDef.tag}.xml`;
  const linkUrl = `${SITE_URL}/tags/${tagDef.tag}/`;
  const title = `Edward Jensen - ${tagDef.title}`;
  const description = tagDef.description;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/assets/css/feed-style.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${linkUrl}</link>
    <description>${escapeXml(description)}</description>
    <language>en-US</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${toRfc822(new Date().toISOString())}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
