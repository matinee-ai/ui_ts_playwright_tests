import { expect, test } from '@playwright/test';
import { parseBundle, parsePricePlans } from '../../src/pages/qastarting.ts';
import { extractAssets, extractLinks, pageMeta, textContent } from '../../src/utils/html.ts';
import { parseRobots, parseSitemap } from '../../src/utils/sitemap.ts';

test.describe('robots.txt', () => {
  test('reads sitemaps and detects a full-site block', () => {
    const robots = parseRobots(`
      User-agent: Googlebot
      Disallow: /
      User-agent: *
      Disallow: /admin   # private
      Sitemap: https://www.example.org/sitemap.xml
    `);
    expect(robots.sitemaps).toEqual(['https://www.example.org/sitemap.xml']);
    expect(robots.blocksEverything).toBe(false);
    expect(parseRobots('User-agent: *\nDisallow: /').blocksEverything).toBe(true);
    expect(parseRobots('User-agent: bingbot\nUser-agent: *\nDisallow: /').blocksEverything).toBe(true);
  });
});

test.describe('sitemap.xml', () => {
  test('parses url sets and sitemap indexes', () => {
    const urlset = parseSitemap(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://www.example.org/</loc></url>
      <url><loc> https://www.example.org/a?x=1&amp;y=2 </loc><lastmod>2026-01-01</lastmod></url></urlset>`);
    expect(urlset).toEqual({ urls: ['https://www.example.org/', 'https://www.example.org/a?x=1&y=2'], sitemaps: [] });

    const index = parseSitemap(`<sitemapindex><sitemap><loc><![CDATA[https://www.example.org/s1.xml]]></loc></sitemap></sitemapindex>`);
    expect(index).toEqual({ urls: [], sitemaps: ['https://www.example.org/s1.xml'] });
    expect(() => parseSitemap('<html><body>Not found</body></html>')).toThrow();
  });
});

test.describe('HTML metadata', () => {
  const html = `<!doctype html><html lang="en-US"><head>
    <title> Spas &amp; Life </title>
    <meta name="description" content="Online support">
    <meta property="og:image" content="/og.png">
    <meta name=robots content='index, follow'>
    <link rel="canonical" href="https://www.example.org/en">
    <link rel="alternate" hreflang="ru" href="/ru">
    <link rel="alternate" hreflang="x-default" href="https://www.example.org/">
    <link rel="stylesheet" href="/main.css"><link rel="icon" href="/favicon.ico">
    <script src="/app.js"></script><script>var inline = 1;</script>
    <!-- <link rel="stylesheet" href="/commented-out.css"> -->
  </head><body><a href="/en/icons#top">Icons</a><a href="mailto:a@b.c">Mail</a><img src="data:image/png;base64,AA"><img src="https://cdn.example.net/i.png"></body></html>`;

  test('reads title, description, language, canonical and alternates', () => {
    const meta = pageMeta(html, 'https://www.example.org/en');
    expect(meta).toMatchObject({
      title: 'Spas & Life',
      description: 'Online support',
      lang: 'en-US',
      robots: 'index, follow',
      canonical: 'https://www.example.org/en',
      ogImage: 'https://www.example.org/og.png',
    });
    expect(meta.alternates).toEqual([
      { hreflang: 'ru', href: 'https://www.example.org/ru' },
      { hreflang: 'x-default', href: 'https://www.example.org/' },
    ]);
  });

  test('extracts http(s) links and assets as absolute URLs', () => {
    expect(extractLinks(html, 'https://www.example.org/en')).toEqual(['https://www.example.org/en/icons']);
    expect(extractAssets(html, 'https://www.example.org/en')).toEqual([
      'https://www.example.org/app.js',
      'https://www.example.org/main.css',
      'https://www.example.org/favicon.ico',
      'https://cdn.example.net/i.png',
    ]);
    expect(textContent(html)).toBe('Spas & Life Icons Mail');
  });
});

test.describe('QA Starting price parsing', () => {
  // Text as published on the QA Starting landing page.
  const text = `THE COST OF COURSES? QA BASIC Starter Plan – $259 Standart Plan – $499 Ultimate Plan – $999 QA for beginners Details
    QA ADVANCE Starter Plan – $299 Standart Plan – $599 Ultimate Plan – $1059 QA Advance level Details
    QA AUTOMATION Starter Plan – $399 Standart Plan – $699 Ultimate Plan – $1259 QA Automation Details
    3 ULTIMATE COURSES $ 3317 ONLY FOR $ 2599 PAY`;

  test('groups plans per course', () => {
    expect(parsePricePlans(text).map((c) => c.map((p) => p.price))).toEqual([
      [259, 499, 999],
      [299, 599, 1059],
      [399, 699, 1259],
    ]);
    expect(parsePricePlans(text)[0].map((p) => p.plan)).toEqual(['starter', 'standard', 'ultimate']);
  });

  test('reads the bundle offer', () => {
    expect(parseBundle(text)).toEqual({ regular: 3317, discounted: 2599 });
    expect(parseBundle('no offer here')).toBeNull();
  });
});
