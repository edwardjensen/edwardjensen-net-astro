/**
 * Working notes RSS feed — /feeds/notes.xml
 * Most recent 20 notes, full content.
 */

import type { APIRoute } from "astro";
import { getWorkingNotes, workingNotePath } from "../../lib/payload";
import { footerText } from "../../data/footer-text";
import { escapeXml, toRfc822, rssHeader, rssFooter } from "../../lib/feed-utils";
import {
  SITE_URL,
  SITE_TITLE,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  FEED_LIMIT_NOTES,
} from "../../config";

const TITLE = `${SITE_TITLE} - Working Notes`;
const DESCRIPTION = `${SITE_DESCRIPTION} - Microblog entries and quick thoughts`;

export const GET: APIRoute = async () => {
  const notes = await getWorkingNotes();

  const now = new Date();
  const sorted = [...notes]
    .filter((n) => n._status === "published" && new Date(n.date) <= now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, FEED_LIMIT_NOTES);

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
      <author>${escapeXml(SITE_AUTHOR)}</author>
      <description>${contentHtml}</description>
    </item>`;
    })
    .join("");

  const xml = `${rssHeader({
    title: TITLE,
    description: DESCRIPTION,
    linkUrl: `${SITE_URL}/notes/`,
    feedUrl: `${SITE_URL}/feeds/notes.xml`,
  })}
    ${items}
  ${rssFooter()}`;

  return new Response(xml.trim(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
