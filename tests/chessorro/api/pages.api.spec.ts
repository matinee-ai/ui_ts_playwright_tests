import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { PAGES } from '../../../src/pages/chessorro.ts';
import { pageMeta } from '../../../src/utils/html.ts';

const site = SITES.chessorro;

test.describe('Chessorro: pages and routing', () => {
  for (const spec of PAGES) {
    test(`${spec.path} is served in English`, async ({ request }) => {
      const res = await request.get(`${site.baseURL}${spec.path}`);
      expect(res.status()).toBe(200);
      const meta = pageMeta(await res.text(), res.url());
      expect(meta.lang ?? '').toMatch(/^en/);
      if (spec.title) expect(meta.title).toMatch(spec.title);
    });
  }

  test('the leaderboard redirects anonymous visitors to sign-in and back', { tag: '@critical' }, async ({ request }) => {
    const res = await request.get(`${site.baseURL}/en/leaderboard`, { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(res.status());
    expect(res.headers()['location']).toMatch(/\/en\/login\?next=%2Fen%2Fleaderboard/);
  });

  test('the root URL leads to a language version', async ({ request }) => {
    const res = await request.get(`${site.baseURL}/`);
    expect(res.status()).toBe(200);
    expect(new URL(res.url()).pathname).toMatch(/^\/[a-z]{2}(\/|$)|^\/$/);
  });
});
