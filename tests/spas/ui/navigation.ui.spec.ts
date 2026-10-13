import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { EN_MENU, PAGES, SpasSite } from '../../../src/pages/spas.ts';
import { linkTests } from '../../../src/suites/links.ts';
import { navigationTests } from '../../../src/suites/navigation.ts';

navigationTests(SITES.spas, { homeLink: /^Онлайн-реабилитация$/, pages: PAGES });
linkTests(SITES.spas, [{ name: 'Главная', path: '/', heading: /онлайн-помощь/i }, ...PAGES.slice(0, 7)]);

test.describe('Spas Life: English version', () => {
  test('the EN switch opens the English home page and RU switches back', async ({ page }) => {
    const site = new SpasSite(page);
    await site.open('/');
    await expect(page.locator('html')).toHaveAttribute('lang', /^ru/);
    await page.locator('header').getByRole('link', { name: 'EN', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/free online help/i);

    await page.locator('header').getByRole('link', { name: 'RU', exact: true }).filter({ visible: true }).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ru/);
  });

  for (const { menu, path } of EN_MENU) {
    test(`English menu "${menu}" opens an English page`, async ({ page, pageErrors }) => {
      const site = new SpasSite(page);
      await site.open('/en');
      await page.locator('header').getByRole('link', { name: menu, exact: true }).filter({ visible: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`${path}/?$`));
      await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
      const h1 = page.getByRole('heading', { level: 1 }).first();
      await expect(h1).toBeVisible();
      await expect(h1, 'heading is in English').not.toHaveText(/[а-яё]/i);
      await expect(page, 'title is in English').not.toHaveTitle(/[а-яё]/i);
      expect(pageErrors.map((e) => e.message)).toEqual([]);
    });
  }
});
