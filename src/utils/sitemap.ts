import type { APIRequestContext } from '@playwright/test';
import { decodeEntities } from './html.ts';

export interface RobotsTxt {
  sitemaps: string[];
  /** True when the `User-agent: *` group contains `Disallow: /`, i.e. the whole site is hidden from crawlers. */
  blocksEverything: boolean;
}

export function parseRobots(text: string): RobotsTxt {
  const sitemaps: string[] = [];
  let blocksEverything = false;
  let agents: string[] = [];
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, field, value] = match;
    switch (field.toLowerCase()) {
      case 'sitemap':
        sitemaps.push(value.trim());
        break;
      case 'user-agent':
        agents = lastWasAgent ? [...agents, value.trim()] : [value.trim()];
        lastWasAgent = true;
        continue;
      case 'disallow':
        if (agents.includes('*') && value.trim() === '/') blocksEverything = true;
        break;
    }
    lastWasAgent = false;
  }
  return { sitemaps, blocksEverything };
}

export interface ParsedSitemap {
  /** Page URLs from a <urlset>. */
  urls: string[];
  /** Child sitemaps from a <sitemapindex>. */
  sitemaps: string[];
}

export function parseSitemap(xml: string): ParsedSitemap {
  if (!/<(urlset|sitemapindex)[\s>]/i.test(xml)) {
    throw new Error('Not a sitemap: expected a <urlset> or <sitemapindex> root element');
  }
  const locs = (container: string) =>
    [...xml.matchAll(new RegExp(`<${container}[\\s>][\\s\\S]*?<loc>\\s*([\\s\\S]*?)\\s*</loc>`, 'gi'))].map((m) =>
      decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')),
    );
  return { urls: locs('url'), sitemaps: locs('sitemap') };
}

export interface SitemapDiscovery {
  /** Sitemap documents that were read. */
  sources: string[];
  urls: string[];
}

/**
 * Finds the site's sitemaps (robots.txt `Sitemap:` lines, else /sitemap.xml)
 * and returns every page URL, following sitemap indexes.
 */
export async function discoverSitemap(
  request: APIRequestContext,
  origin: string,
  { maxDocuments = 10 } = {},
): Promise<SitemapDiscovery> {
  const robots = await request.get(`${origin}/robots.txt`);
  const queue = robots.ok() ? parseRobots(await robots.text()).sitemaps : [];
  if (!queue.length) queue.push(`${origin}/sitemap.xml`);

  const sources: string[] = [];
  const urls = new Set<string>();
  while (queue.length && sources.length < maxDocuments) {
    const url = queue.shift()!;
    if (sources.includes(url)) continue;
    const res = await request.get(url);
    if (!res.ok()) continue;
    const parsed = parseSitemap(await res.text());
    sources.push(url);
    parsed.urls.forEach((u) => urls.add(u));
    queue.push(...parsed.sitemaps);
  }
  return { sources, urls: [...urls] };
}
