import { expect, test } from '../../src/fixtures.ts';
import { parseBundleOffer, parsePlanPrices } from '../../src/pages/qastarting.ts';
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
  // Card and bundle text as published on qastarting.org.
  const card = 'QA BASIC QA for beginners Starter Self-paced, on your own $259 Standard Guided: 1 hour with a mentor a week $499 Unlimited Maximum support: 3 hours with a mentor a week $999 View details';
  const bundle = 'Frequently bought together −20% Complete QA path ✓ QA BASIC ✓ QA ADVANCE ✓ QA AUTOMATION $3,317 $2,653 Save $664 (~20%) All 3 courses · Unlimited plan Get the bundle';

  test('reads the three plan prices of a course card', () => {
    expect(parsePlanPrices(card)).toEqual({ starter: 259, standard: 499, unlimited: 999 });
    expect(parsePlanPrices('Starter $1,059 Unlimited $1,259')).toEqual({ starter: 1059, unlimited: 1259 });
  });

  test('reads the bundle offer', () => {
    expect(parseBundleOffer(bundle)).toEqual({ regular: 3317, discounted: 2653, saving: 664, percent: 20 });
    expect(parseBundleOffer('no offer here')).toBeNull();
  });
});
