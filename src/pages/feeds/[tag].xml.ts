/**
 * Dynamic featured tag RSS feeds — /feeds/[tag].xml
 * One feed per featured tag, filtered posts.
 */

import type { APIRoute, GetStaticPaths } from "astro";
import { getPosts, postPath } from "../../lib/payload";
import { featuredTags } from "../../data/featured-tags";
import { footerText } from "../../data/footer-text";
import { escapeXml, toRfc822, rssHeader, rssFooter } from "../../lib/feed-utils";
import { SITE_URL, SITE_TITLE, SITE_AUTHOR, FEED_LIMIT_TAG } from "../../config";

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
      .slice(0, FEED_LIMIT_TAG);

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
      <author>${escapeXml(SITE_AUTHOR)}</author>
      <description>${contentHtml}</description>
    </item>`;
    })
    .join("");

  const xml = `${rssHeader({
    title: `${SITE_TITLE} - ${tagDef.title}`,
    description: tagDef.description,
    linkUrl: `${SITE_URL}/tags/${tagDef.tag}/`,
    feedUrl: `${SITE_URL}/feeds/${tagDef.tag}.xml`,
  })}
    ${items}
  ${rssFooter()}`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
