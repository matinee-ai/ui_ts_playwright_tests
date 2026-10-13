import { expect, test } from '../../../src/fixtures.ts';
import { CORE_BUNDLE, COURSE_TRACKS, QaStartingSite, parseBundleOffer, type CoursePrices } from '../../../src/pages/qastarting.ts';

test.describe('QA Starting: pricing', { tag: '@critical' }, () => {
  let site: QaStartingSite;
  let cards: CoursePrices[];

  test.beforeEach(async ({ page }) => {
    site = new QaStartingSite(page);
    await site.open();
    await site.byId('pricing').scrollIntoViewIfNeeded();
    cards = await site.pricingCards();
  });

  test('every course has a Starter, Standard and Unlimited price, rising with support', async () => {
    expect(cards.map((c) => c.course), 'courses with prices').toEqual(COURSE_TRACKS);
    for (const { course, prices } of cards) {
      expect(Object.keys(prices), `${course} plans`).toEqual(['starter', 'standard', 'unlimited']);
      expect(prices.starter!, `${course}: Starter < Standard`).toBeLessThan(prices.standard!);
      expect(prices.standard!, `${course}: Standard < Unlimited`).toBeLessThan(prices.unlimited!);
    }
  });

  test('the comparison table matches the price cards', async () => {
    const table = await site.pricingTable();
    expect(table.map((r) => r.course), 'table rows').toEqual(COURSE_TRACKS);
    for (const row of table) {
      const card = cards.find((c) => c.course === row.course)!;
      expect(row.prices.starter, `${row.course} Starter`).toBe(card.prices.starter);
      expect(row.prices.unlimited, `${row.course} Unlimited`).toBe(card.prices.unlimited);
    }
  });

  test('the Complete QA path bundle is the three Unlimited plans minus the advertised saving', async ({ page }) => {
    const bundleCard = page.getByRole('heading', { name: 'Complete QA path' }).locator('xpath=ancestor::*[.//a][1]');
    const offer = parseBundleOffer(await bundleCard.innerText());
    expect(offer, 'bundle prices "$regular $discounted Save $x (~y%)"').not.toBeNull();

    const unlimited = CORE_BUNDLE.map((course) => cards.find((c) => c.course === course)!.prices.unlimited!);
    expect(offer!.regular, `regular price = ${unlimited.join(' + ')}`).toBe(unlimited.reduce((a, b) => a + b, 0));
    expect(offer!.discounted, 'discounted = regular - saving').toBe(offer!.regular - offer!.saving);
    expect(Math.round((offer!.saving / offer!.regular) * 100), 'advertised percentage').toBe(offer!.percent);
    await expect(bundleCard.getByRole('link', { name: 'Get the bundle' })).toHaveAttribute('href', /\/checkout\?bundle=core$/);
  });

  test('"View details" on each price card opens that course', async ({ page }) => {
    for (const course of COURSE_TRACKS) {
      await test.step(course, async () => {
        await site.open('/#pricing');
        const card = site.byId('pricing').getByRole('heading', { level: 3, name: course, exact: true }).locator('xpath=ancestor::*[.//a][1]');
        await card.getByRole('link', { name: 'View details' }).first().click();
        await expect(page.getByRole('heading', { level: 1, name: course, exact: true })).toBeVisible();
      });
    }
  });
});
