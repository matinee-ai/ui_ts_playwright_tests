import type { SiteConfig } from '../../config/sites.ts';
import { expect, test } from '../fixtures.ts';
import { extractAssets, pageMeta, textContent } from '../utils/html.ts';
import { brokenUrls, sample, sameSite } from '../utils/http.ts';
import { discoverSitemap, parseRobots } from '../utils/sitemap.ts';

/** Registers the HTTP-level checks every site must pass. */
export function commonApiTests(site: SiteConfig): void {
  const home = `${site.baseURL}${site.homePath}`;

  test.describe(`${site.name}: HTTP contract`, () => {
    test('landing page responds 200 with HTML within the time budget', async ({ request }, testInfo) => {
      const started = Date.now();
      const res = await request.get(home);
      const elapsed = Date.now() - started;
      await testInfo.attach('response-headers.json', { body: JSON.stringify(res.headers(), null, 2), contentType: 'application/json' });

      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toMatch(/text\/html/i);
      expect((await res.text()).length, 'non-trivial HTML body').toBeGreaterThan(500);
      expect(elapsed, `landing page took ${elapsed}ms`).toBeLessThan(site.responseBudgetMs);
    });

    test('plain HTTP is redirected to HTTPS', async ({ request }) => {
      const res = await request.get(home.replace(/^https:/, 'http:'), { maxRedirects: 0 });
      expect([301, 302, 307, 308]).toContain(res.status());
      expect(res.headers()['location']).toMatch(/^https:\/\//);
    });

    test('landing page is indexable and has SEO metadata', async ({ request }) => {
      const res = await request.get(home);
      const meta = pageMeta(await res.text(), res.url());

      expect(meta.title, '<title>').not.toBe('');
      expect(meta.description, '<meta name="description">').toBeTruthy();
      expect(meta.lang, '<html lang>').toBeTruthy();
      expect(meta.robots ?? '', 'meta robots must not hide production from search engines').not.toMatch(/noindex/i);
      expect(res.headers()['x-robots-tag'] ?? '').not.toMatch(/noindex/i);
      if (meta.canonical) {
        expect(meta.canonical, 'canonical URL').toMatch(/^https:\/\//);
        expect(sameSite(meta.canonical, site.baseURL), `canonical ${meta.canonical} points to another site`).toBe(true);
        expect((await request.get(meta.canonical)).status(), `canonical ${meta.canonical}`).toBe(200);
      }
    });

    test('robots.txt allows crawling and lists only own sitemaps', async ({ request }) => {
      const res = await request.get(`${site.baseURL}/robots.txt`);
      expect(res.status()).toBe(200);
      const robots = parseRobots(await res.text());
      expect(robots.blocksEverything, 'robots.txt disallows the whole site for all crawlers').toBe(false);
      for (const sitemap of robots.sitemaps) expect(sameSite(sitemap, site.baseURL), sitemap).toBe(true);
    });

    test('every page in the sitemap is live', async ({ request }) => {
      const { sources, urls } = await discoverSitemap(request, site.baseURL);
      test.skip(!sources.length, 'The site publishes no sitemap');
      expect(urls.length, `pages listed in ${sources.join(', ')}`).toBeGreaterThan(0);

      const foreign = urls.filter((u) => !sameSite(u, site.baseURL));
      expect(foreign, 'sitemap must only list pages of this site').toEqual([]);
      expect(await brokenUrls(request, sample(urls, 40))).toEqual([]);
    });

    test('unknown URL returns 404, not a soft 200', async ({ request }) => {
      const res = await request.get(`${site.baseURL}/pw-missing-page-${Date.now()}`);
      expect([404, 410]).toContain(res.status());
    });

    test('scripts, styles and images used by the landing page load', async ({ request }) => {
      const res = await request.get(home);
      const assets = extractAssets(await res.text(), res.url());
      expect(assets.length, 'assets referenced by the landing page').toBeGreaterThan(0);
      expect(await brokenUrls(request, sample(assets, 60))).toEqual([]);
    });

    test('every language version is live and declares its language', async ({ request }) => {
      const res = await request.get(home);
      const { alternates } = pageMeta(await res.text(), res.url());
      test.skip(!alternates.length, 'The landing page declares no hreflang alternates');

      for (const alt of alternates) {
        const page = await request.get(alt.href);
        expect(page.status(), `${alt.hreflang}: ${alt.href}`).toBe(200);
        if (alt.hreflang.toLowerCase() === 'x-default') continue;
        const lang = pageMeta(await page.text(), page.url()).lang ?? '';
        expect(lang.toLowerCase().split('-')[0], `<html lang> of ${alt.href}`).toBe(alt.hreflang.toLowerCase().split('-')[0]);
      }
    });

    if (site.contacts.emails.length + site.contacts.phones.length + site.contacts.telegram.length) {
      test('published contact details are correct', async ({ request }) => {
        const res = await request.get(home);
        const html = await res.text();
        const text = textContent(html).toLowerCase();
        const lowerHtml = html.toLowerCase();

        for (const email of site.contacts.emails) {
          expect(text.includes(email) || lowerHtml.includes(`mailto:${email}`), `email ${email}`).toBe(true);
        }
        for (const phone of site.contacts.phones) {
          // Last 10 digits, any formatting between them: "+1 (954) 501-0763", "9545010763", ...
          const pattern = new RegExp(phone.slice(-10).split('').join('[\\s().\\-]*'));
          expect(pattern.test(text) || pattern.test(lowerHtml), `phone ${phone}`).toBe(true);
        }
        for (const handle of site.contacts.telegram) {
          expect(lowerHtml.includes(`t.me/${handle}`) || text.includes(`@${handle}`), `telegram @${handle}`).toBe(true);
        }
      });
    }
  });
}
