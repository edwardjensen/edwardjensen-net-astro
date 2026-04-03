/**
 * Search index endpoint.
 *
 * Generates /search-index.json at build time with all searchable content.
 * Consumed at runtime by search.js (Lunr.js).
 *
 * Document fields mirror the Jekyll search-index.json Liquid template:
 *   id, title, url, type, date, excerpt, content
 */

import type { APIRoute } from "astro";
import {
  getPosts,
  getWorkingNotes,
  getPhotography,
  postPath,
  workingNotePath,
  photoPath,
} from "../lib/payload";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function makeExcerpt(text: string, words = 50): string {
  return text.split(/\s+/).slice(0, words).join(" ");
}

function slugify(url: string): string {
  return url.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
}

export const GET: APIRoute = async () => {
  const [posts, notes, photos] = await Promise.all([
    getPosts(),
    getWorkingNotes(),
    getPhotography(),
  ]);

  type SearchDoc = {
    id: string;
    title: string;
    url: string;
    type: string;
    date: string;
    excerpt: string;
    content: string;
  };

  const documents: SearchDoc[] = [];

  // Blog posts
  for (const post of posts) {
    if (post._status !== "published") continue;
    const url = postPath(post.slug, post.date);
    const plainContent = stripHtml(post.contentHtml);
    documents.push({
      id: slugify(url),
      title: post.title,
      url,
      type: "post",
      date: new Date(post.date).toISOString().slice(0, 10),
      excerpt: makeExcerpt(post.excerpt ? stripHtml(post.excerpt) : plainContent),
      content: plainContent,
    });
  }

  // Working notes
  for (const note of notes) {
    if (note._status !== "published") continue;
    const url = workingNotePath(note.slug, note.date);
    const plainContent = stripHtml(note.contentHtml);
    documents.push({
      id: slugify(url),
      title: note.title,
      url,
      type: "note",
      date: new Date(note.date).toISOString().slice(0, 10),
      excerpt: makeExcerpt(plainContent),
      content: plainContent,
    });
  }

  // Photography
  for (const photo of photos) {
    if (photo._status !== "published") continue;
    const url = photoPath(photo.slug, photo.date);
    const plainContent = stripHtml(photo.contentHtml);
    documents.push({
      id: slugify(url),
      title: photo.title,
      url,
      type: "photography",
      date: new Date(photo.date).toISOString().slice(0, 10),
      excerpt: makeExcerpt(plainContent || photo.title),
      content: plainContent || photo.title,
    });
  }

  return new Response(JSON.stringify({ documents }), {
    headers: { "Content-Type": "application/json" },
  });
};
