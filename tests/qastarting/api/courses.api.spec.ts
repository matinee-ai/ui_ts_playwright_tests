import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { COURSE_TRACKS, parsePricePlans } from '../../../src/pages/qastarting.ts';
import { textContent } from '../../../src/utils/html.ts';

const site = SITES.qastarting;

test.describe('QA Starting: course content', () => {
  test('courses page lists the full learning path', async ({ request }) => {
    const res = await request.get(`${site.baseURL}/courses`);
    expect(res.status()).toBe(200);
    const text = textContent(await res.text());
    for (const track of COURSE_TRACKS) expect(text, track).toMatch(new RegExp(track, 'i'));
  });

  test('landing page publishes a price for every plan', async ({ request }) => {
    const res = await request.get(`${site.baseURL}${site.homePath}`);
    const plans = parsePricePlans(textContent(await res.text()));
    expect(plans.length, 'courses with price plans').toBeGreaterThanOrEqual(3);
    for (const course of plans) expect(course).toHaveLength(3);
  });

  test('QA BASIC enrolment page is live and contains a form', async ({ request }) => {
    const res = await request.get(`${site.baseURL}/en/qabasic`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(textContent(html)).toMatch(/QA BASIC/i);
    expect(html).toMatch(/<form[\s>]/i);
  });
});
