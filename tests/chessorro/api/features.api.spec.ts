import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { CORE_FEATURES } from '../../../src/pages/chessorro.ts';
import { extractLinks, pageMeta, textContent } from '../../../src/utils/html.ts';
import { sameSite } from '../../../src/utils/http.ts';

const site = SITES.chessorro;
const home = `${site.baseURL}${site.homePath}`;

test.describe('Chessorro: feature pages', () => {
  test('English landing page is served in English and names every feature', async ({ request }) => {
    const res = await request.get(home);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(pageMeta(html, res.url()).lang ?? '').toMatch(/^en/i);
    const text = textContent(html);
    for (const feature of CORE_FEATURES) expect(text, feature.name).toMatch(feature.heading);
  });

  test('feature pages linked from the landing page are live', async ({ request }) => {
    const res = await request.get(home);
    const links = extractLinks(await res.text(), res.url()).filter((u) => sameSite(u, site.baseURL));
    const featureLinks = links.filter((u) => /puzzle|opening|offline|board|practice|play|game/i.test(new URL(u).pathname));
    expect(featureLinks.length, `feature links among ${links.length} links`).toBeGreaterThan(0);

    for (const url of featureLinks) {
      const page = await request.get(url);
      expect(page.status(), url).toBe(200);
      expect(page.headers()['content-type'], url).toMatch(/text\/html/);
    }
  });
});
