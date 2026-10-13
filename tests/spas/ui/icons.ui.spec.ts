import { expect, test } from '../../../src/fixtures.ts';
import { ICONS_PATH, SpasSite } from '../../../src/pages/spas.ts';
import { escapeRegExp } from '../../../src/utils/html.ts';

test.describe('Spas Life: icons gallery', () => {
  test('opening an icon shows its page with matching title and image', async ({ page }) => {
    const site = new SpasSite(page);
    await site.openIcons();
    await expect(page).toHaveURL(new RegExp(`${ICONS_PATH}/?$`));

    const cards = page.locator(`a[href*="${ICONS_PATH}/"]:not([href$="/icons/"])`).filter({ visible: true });
    await expect(cards.first(), 'icon cards in the gallery').toBeVisible();

    const card = cards.first();
    const cardText = (await card.innerText()).trim().split('\n')[0];
    const target = new URL((await card.getAttribute('href'))!, page.url()).pathname.replace(/\/$/, '');
    await card.click();
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === target);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    if (cardText) await expect(heading).toContainText(cardText, { ignoreCase: true });
    await expect(page).toHaveTitle(new RegExp(escapeRegExp((await heading.innerText()).trim()), 'i'));

    const image = page.locator('main img, article img').filter({ visible: true }).first();
    await expect(image).toBeVisible();
    expect(await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 'icon image loaded').toBe(true);
  });
});
