import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { PAGES, QaStartingSite, SECTIONS } from '../../../src/pages/qastarting.ts';
import { linkTests } from '../../../src/suites/links.ts';
import { navigationTests } from '../../../src/suites/navigation.ts';

navigationTests(SITES.qastarting, { homeLink: /QAstarting/, pages: PAGES });
linkTests(SITES.qastarting, [{ name: 'Home', path: '/', heading: /QA engineer/i }, ...PAGES.slice(0, 6)]);

test.describe('QA Starting: in-page menu', () => {
  for (const { menu, id } of SECTIONS) {
    test(`"${menu}" scrolls to its section`, async ({ page }) => {
      const site = new QaStartingSite(page);
      await site.open();
      await page.getByRole('navigation').first().getByRole('link', { name: menu, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(site.byId(id), `#${id} section`).toBeInViewport();
    });
  }

  test('section links from another page come back to the home page section', async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open('/career-services');
    await page.getByRole('navigation').first().getByRole('link', { name: 'Pricing', exact: true }).click();
    await expect(page).toHaveURL(/qastarting\.org\/#pricing$/);
    await expect(site.byId('pricing')).toBeInViewport();
  });
});
