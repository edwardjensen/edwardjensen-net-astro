export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toRfc822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

export function toW3CDate(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}

export function rssHeader(options: {
  title: string;
  description: string;
  linkUrl: string;
  feedUrl: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/assets/css/feed-style.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(options.title)}</title>
    <link>${options.linkUrl}</link>
    <description>${escapeXml(options.description)}</description>
    <language>en-US</language>
    <atom:link href="${options.feedUrl}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${toRfc822(new Date().toISOString())}</lastBuildDate>`;
}

export function rssFooter(): string {
  return `  </channel>\n</rss>`;
}
