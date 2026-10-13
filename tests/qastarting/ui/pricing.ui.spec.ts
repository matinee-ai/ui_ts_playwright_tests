import { expect, test } from '../../../src/fixtures.ts';
import { QaStartingSite, parseBundle, parsePricePlans } from '../../../src/pages/qastarting.ts';

test.describe('QA Starting: pricing', { tag: '@critical' }, () => {
  let text: string;

  test.beforeEach(async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open();
    await site.section(/cost of courses|prices?|pricing|стоимость/i).scrollIntoViewIfNeeded();
    text = await page.locator('body').innerText();
  });

  test('every course offers Starter < Standard < Ultimate plans', async () => {
    const courses = parsePricePlans(text);
    expect(courses.length, 'courses with price plans on the landing page').toBeGreaterThanOrEqual(3);

    for (const plans of courses) {
      expect(plans.map((p) => p.plan), 'plan order').toEqual(['starter', 'standard', 'ultimate']);
      const prices = plans.map((p) => p.price);
      expect(prices.every((p) => p > 0), `positive prices ${prices}`).toBe(true);
      expect([...prices].sort((a, b) => a - b), `prices rise with the plan: ${prices}`).toEqual(prices);
    }
  });

  test('the 3-course bundle costs less than the Ultimate plans bought separately', async () => {
    const bundle = parseBundle(text);
    expect(bundle, '"3 ULTIMATE COURSES $... ONLY FOR $..." offer').not.toBeNull();

    const ultimateTotal = parsePricePlans(text)
      .slice(0, 3)
      .map((plans) => plans.find((p) => p.plan === 'ultimate')?.price ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(bundle!.regular, 'bundle "regular" price equals the sum of the three Ultimate plans').toBe(ultimateTotal);
    expect(bundle!.discounted).toBeLessThan(bundle!.regular);
  });
});
