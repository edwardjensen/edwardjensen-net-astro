/**
 * Working Notes JSON Feed — /feeds/notes.json
 * Most recent 20 working notes with full content, JSON Feed 1.1 format.
 */

import type { APIRoute } from "astro";
import { getWorkingNotes, workingNotePath } from "../../lib/payload";
import { footerText } from "../../data/footer-text";

const SITE_URL = "https://www.edwardjensen.net";
const AUTHOR = "Edward Jensen";
const FEED_LIMIT = 20;

export const GET: APIRoute = async () => {
  const notes = await getWorkingNotes();

  const now = new Date();
  const sorted = [...notes]
    .filter((n) => n._status === "published" && new Date(n.date) <= now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT);

  const items = sorted.map((note) => {
    const url = `${SITE_URL}${workingNotePath(note.slug, note.date)}`;
    const contentHtml = note.contentHtml + `<p>${footerText.feed_footer_text}</p>`;
    const summary = note.contentHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

    const item: Record<string, unknown> = {
      id: url,
      url,
      title: note.title,
      content_html: contentHtml,
      summary,
      date_published: new Date(note.date).toISOString(),
      date_modified: new Date(note.updatedAt).toISOString(),
    };
    if (note.tags?.length) item["tags"] = note.tags;
    return item;
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: "Edward Jensen - Working Notes",
    description:
      "Edward Jensen is a nonprofit technology professional who writes about the intersection of technology and mission-driven impact work. - Microblog entries and quick thoughts",
    home_page_url: `${SITE_URL}/notes/`,
    feed_url: `${SITE_URL}/feeds/notes.json`,
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
