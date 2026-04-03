/**
 * Sitemap — /sitemap.xml
 *
 * Generates a sitemaps.org-compliant XML sitemap with all public pages.
 * Mirrors Jekyll's sitemap_generator.rb: excludes searchable:false pages,
 * non-HTML files, and draft content.
 */

import type { APIRoute } from "astro";
import {
  getPosts,
  getWorkingNotes,
  getPhotography,
  getHistoricPosts,
  getPages,
  postPath,
  workingNotePath,
  photoPath,
  historicPostPath,
} from "../lib/payload";
import { featuredTags } from "../data/featured-tags";

const SITE_URL = "https://www.edwardjensen.net";

interface SitemapEntry {
  url: string;
  lastmod: string;
}

function toW3CDate(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}

export const GET: APIRoute = async () => {
  const [posts, notes, photos, historicPosts, pages] = await Promise.all([
    getPosts(),
    getWorkingNotes(),
    getPhotography(),
    getHistoricPosts(),
    getPages(),
  ]);

  const entries: SitemapEntry[] = [];

  // Static well-known pages
  const staticPages = [
    { url: "/", lastmod: new Date().toISOString() },
    { url: "/writing/", lastmod: new Date().toISOString() },
    { url: "/notes/", lastmod: new Date().toISOString() },
    { url: "/photos/", lastmod: new Date().toISOString() },
    { url: "/tags/", lastmod: new Date().toISOString() },
    { url: "/archive/", lastmod: new Date().toISOString() },
    { url: "/archive/landing/", lastmod: new Date().toISOString() },
  ];
  for (const p of staticPages) {
    entries.push({ url: p.url, lastmod: toW3CDate(p.lastmod) });
  }

  // Featured tag pages
  for (const tag of featuredTags) {
    entries.push({
      url: `/tags/${tag.tag}/`,
      lastmod: toW3CDate(new Date().toISOString()),
    });
  }

  // Blog posts
  for (const post of posts) {
    if (post._status !== "published") continue;
    if (post.sitemap === false) continue;
    entries.push({
      url: postPath(post.slug, post.date),
      lastmod: toW3CDate(post.updatedAt || post.date),
    });
  }

  // Working notes
  for (const note of notes) {
    if (note._status !== "published") continue;
    if (note.sitemap === false) continue;
    entries.push({
      url: workingNotePath(note.slug, note.date),
      lastmod: toW3CDate(note.updatedAt || note.date),
    });
  }

  // Photography
  for (const photo of photos) {
    if (photo._status !== "published") continue;
    if (photo.sitemap === false) continue;
    entries.push({
      url: photoPath(photo.slug, photo.date),
      lastmod: toW3CDate(photo.updatedAt || photo.date),
    });
  }

  // Historic posts
  for (const post of historicPosts) {
    if (post._status !== "published") continue;
    if (post.sitemap === false) continue;
    entries.push({
      url: historicPostPath(post.slug),
      lastmod: toW3CDate(post.updatedAt || post.date),
    });
  }

  // CMS pages
  for (const page of pages) {
    if (page._status !== "published") continue;
    if (page.sitemap === false) continue;
    if (!page.searchable) continue; // match Jekyll: searchable:false → excluded
    if (!page.permalink) continue;
    entries.push({
      url: page.permalink,
      lastmod: toW3CDate(page.updatedAt || page.createdAt),
    });
  }

  const urlElements = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${SITE_URL}${e.url}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
