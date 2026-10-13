import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { ICONS_PATH, KNOWN_ICON, PAGES } from '../../../src/pages/spas.ts';
import { extractLinks, pageMeta, textContent } from '../../../src/utils/html.ts';
import { brokenUrls } from '../../../src/utils/http.ts';

const site = SITES.spas;

test.describe('Spas Life: published content', () => {
  test('a known icon page is published in English', async ({ request }) => {
    const res = await request.get(`${site.baseURL}${KNOWN_ICON.path}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const meta = pageMeta(html, res.url());
    expect(meta.title).toContain(KNOWN_ICON.title);
    expect(meta.lang ?? '').toMatch(/^en/i);
    expect(textContent(html)).toContain(KNOWN_ICON.title);
  });

  test('icon gallery links only to live icon pages', async ({ request }) => {
    const res = await request.get(`${site.baseURL}${ICONS_PATH}`);
    expect(res.status()).toBe(200);
    const iconPages = extractLinks(await res.text(), res.url()).filter((u) =>
      new RegExp(`${ICONS_PATH}/[^/?#]+/?$`).test(new URL(u).pathname),
    );
    expect(iconPages.length, 'icon pages linked from the gallery').toBeGreaterThan(0);
    expect(iconPages.map((u) => new URL(u).pathname), 'the known icon is listed').toContain(KNOWN_ICON.path);
    expect(await brokenUrls(request, iconPages)).toEqual([]);
  });

  test('every page offers the free mentor conversation', async ({ request }) => {
    for (const path of ['/en', KNOWN_ICON.path]) {
      const res = await request.get(`${site.baseURL}${path}`);
      expect(textContent(await res.text()), path).toMatch(/free 15-minute conversation with a mentor/i);
    }
  });
});

test.describe('Spas Life: Russian and English versions', () => {
  for (const spec of PAGES.filter((p) => !p.path.startsWith('/orthodoxy/'))) {
    test(`${spec.path} exists in Russian and English`, async ({ request }) => {
      const ru = await request.get(`${site.baseURL}${spec.path}`);
      expect(ru.status(), spec.path).toBe(200);
      expect(pageMeta(await ru.text(), ru.url()).lang ?? '', `${spec.path} lang`).toMatch(/^ru/);

      const en = await request.get(`${site.baseURL}/en${spec.path}`);
      expect(en.status(), `/en${spec.path}`).toBe(200);
      const meta = pageMeta(await en.text(), en.url());
      expect(meta.lang ?? '', `/en${spec.path} lang`).toMatch(/^en/);
      expect(meta.title, `/en${spec.path} title is translated`).not.toMatch(/[а-яё]/i);
    });
  }
});
