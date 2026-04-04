<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
<xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
    <title><xsl:value-of select="rss/channel/title"/> RSS Feed</title>
    <style type="text/css">
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            background-color: #f9f9f9;
        }
        header {
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid #eaeaea;
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            color: #2c3e50;
        }
        h2 {
            font-size: 1.4rem;
            margin: 0 0 0.5rem 0;
        }
        .description {
            color: #666;
            margin-bottom: 1rem;
        }
        .feed-meta {
            font-size: 0.85rem;
            color: #666;
            margin-bottom: 1rem;
        }
        .feed-item {
            margin-bottom: 2rem;
            padding: 1.5rem;
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .item-date {
            font-size: 0.85rem;
            color: #666;
            margin-bottom: 0.5rem;
        }
        .item-description {
            margin-top: 1rem;
        }
        .item-description img {
            max-width: 100%;
            height: auto;
            margin: 1rem 0;
            border-radius: 5px;
        }
        a {
            color: #3498db;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .categories {
            margin-top: 1rem;
            font-size: 0.85rem;
        }
        .category {
            display: inline-block;
            background-color: #e9f5fe;
            padding: 0.2rem 0.5rem;
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
            border-radius: 3px;
            color: #3498db;
        }
        .tag {
            display: inline-block;
            background-color: #f0f0f0;
            padding: 0.2rem 0.5rem;
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
            border-radius: 3px;
            color: #666;
        }
        .feed-footer {
            margin-top: 2rem;
            text-align: center;
            font-size: 0.85rem;
            color: #666;
        }
        .subscribe-button {
            display: inline-block;
            background-color: #e74c3c;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            margin-top: 1rem;
            font-weight: bold;
        }
        .subscribe-button:hover {
            background-color: #c0392b;
            text-decoration: none;
        }
        @media (max-width: 600px) {
            body {
                padding: 1rem;
            }
            .feed-item {
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1><xsl:value-of select="rss/channel/title"/></h1>
        <div class="description">
            <xsl:value-of select="rss/channel/description"/>
        </div>
        <div class="feed-meta">
            <div>Last updated: <xsl:value-of select="rss/channel/lastBuildDate"/></div>
            <div>Generated with: <xsl:value-of select="rss/channel/generator"/></div>
        </div>
        <a class="subscribe-button" href="{rss/channel/atom:link/@href}">
            Subscribe to this RSS Feed
        </a>
    </header>

    <main>
        <xsl:for-each select="rss/channel/item">
            <article class="feed-item">
                <h2>
                    <a href="{link}">
                        <xsl:value-of select="title"/>
                    </a>
                </h2>
                <div class="item-date">
                    <xsl:value-of select="pubDate"/>
                </div>
                <div class="item-description">
                    <xsl:value-of select="description" disable-output-escaping="yes"/>
                </div>
                <div class="categories">
                    <xsl:for-each select="category">
                        <span class="category">
                            <xsl:value-of select="."/>
                        </span>
                    </xsl:for-each>
                    <xsl:for-each select="tag">
                        <span class="tag">
                            <xsl:value-of select="."/>
                        </span>
                    </xsl:for-each>
                </div>
            </article>
        </xsl:for-each>
    </main>
    
    <footer class="feed-footer">
        <p>Visit <a href="{rss/channel/link}">
            <xsl:value-of select="rss/channel/title"/>
        </a> for more content.</p>
    </footer>
</body>
</html>
</xsl:template>
</xsl:stylesheet>