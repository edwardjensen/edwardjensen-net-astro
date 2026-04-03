/**
 * Working notes RSS feed — /feeds/notes.xml
 * Most recent 20 notes, full content.
 */

import type { APIRoute } from "astro";
import { getWorkingNotes, workingNotePath } from "../../lib/payload";
import { footerText } from "../../data/footer-text";

const SITE_URL = "https://www.edwardjensen.net";
const AUTHOR = "Edward Jensen";
const TITLE = "Edward Jensen - Working Notes";
const DESCRIPTION =
  "Edward Jensen is a nonprofit technology professional who writes about the intersection of technology and mission-driven impact work. - Microblog entries and quick thoughts";
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

export const GET: APIRoute = async () => {
  const notes = await getWorkingNotes();

  const now = new Date();
  const sorted = [...notes]
    .filter((n) => n._status === "published" && new Date(n.date) <= now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT);

  const items = sorted
    .map((note) => {
      const url = `${SITE_URL}${workingNotePath(note.slug, note.date)}`;
      const contentHtml = escapeXml(
        note.contentHtml + `<p>${footerText.feed_footer_text}</p>`
      );
      return `
    <item>
      <title>${escapeXml(note.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${toRfc822(note.date)}</pubDate>
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
    <link>${SITE_URL}/notes/</link>
    <description>${escapeXml(DESCRIPTION)}</description>
    <language>en-US</language>
    <atom:link href="${SITE_URL}/feeds/notes.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${toRfc822(new Date().toISOString())}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
