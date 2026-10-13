import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { COURSES, PAGES } from '../../../src/pages/qastarting.ts';
import { pageMeta, textContent } from '../../../src/utils/html.ts';

const site = SITES.qastarting;

test.describe('QA Starting: pages and course content', () => {
  for (const spec of PAGES) {
    test(`${spec.path} responds 200 with its own title`, async ({ request }) => {
      const res = await request.get(`${site.baseURL}${spec.path}`);
      expect(res.status()).toBe(200);
      const meta = pageMeta(await res.text(), res.url());
      if (spec.title) expect(meta.title).toMatch(spec.title);
    });
  }

  test('every course page lists its program modules', async ({ request }) => {
    for (const course of COURSES) {
      const text = textContent(await (await request.get(`${site.baseURL}/courses/${course.slug}`)).text());
      expect(text, course.name).toContain(course.name);
      expect(text.match(/Module \d+ —/g)?.length ?? 0, `${course.name} modules`).toBeGreaterThanOrEqual(4);
    }
  });

  test('checkout has its own page title', { tag: '@minor' }, async ({ request }) => {
    const home = pageMeta(await (await request.get(`${site.baseURL}/`)).text(), site.baseURL).title;
    const checkout = pageMeta(await (await request.get(`${site.baseURL}/checkout`)).text(), site.baseURL).title;
    expect(checkout, 'checkout title should differ from the home page title').not.toBe(home);
  });
});
