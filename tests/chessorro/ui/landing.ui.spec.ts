import { expect, test } from '../../../src/fixtures.ts';
import { ChessorroApp, GAMES } from '../../../src/pages/chessorro.ts';

test.describe('Chessorro: landing page', () => {
  test('every game card opens that game against the computer', { tag: '@critical' }, async ({ page }) => {
    const app = new ChessorroApp(page);
    for (const game of GAMES) {
      await test.step(game, async () => {
        await app.open();
        const card = app.gameCard(game);
        await expect(card, `${game} card`).toBeVisible();
        await card.getByRole('link', { name: 'Play vs computer' }).click();
        await expect(page).toHaveURL(new RegExp(`/en/play/${game.toLowerCase()}$`));
        await expect(page.getByRole('heading', { level: 1, name: `${game} vs computer` })).toBeVisible();
      });
    }
  });

  test('hero calls to action lead to playing and to sign-up', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.open();
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText(/Chessorro\s*—\s*Your move\./i);

    await main.getByRole('link', { name: 'Play now', exact: true }).first().click();
    await expect(page).toHaveURL(/\/en\/play\/chess$/);

    await app.open();
    await page.getByRole('main').getByRole('link', { name: 'Play a friend' }).click();
    await expect(page).toHaveURL(/\/en\/signup$/);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  test('the ratings ladder asks anonymous visitors to sign in first', { tag: '@critical' }, async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.open();
    await page.getByRole('link', { name: 'See the ladder' }).click();
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fleaderboard/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('dark theme can be switched on and off', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.open();
    const html = page.locator('html');
    const before = `${await html.getAttribute('class')} ${await html.getAttribute('data-theme')} ${await html.getAttribute('style')}`;

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.getByRole('button', { name: 'Switch to light theme' }), 'toggle now offers the light theme').toBeVisible();
    await expect.poll(async () => `${await html.getAttribute('class')} ${await html.getAttribute('data-theme')} ${await html.getAttribute('style')}`).not.toBe(before);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Switch to light theme' }), 'choice survives a reload').toBeVisible();
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  });

  test('language menu lists languages and switches the page language', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.open();
    await app.languageButton().click();
    const choices = page.getByRole('menuitem').or(page.getByRole('menuitemradio')).or(page.getByRole('option')).or(page.getByRole('listbox').getByRole('link'));
    await expect(choices.first(), 'language choices').toBeVisible();
    const other = choices.filter({ hasNotText: /^\s*(en|english)\s*$/i }).first();
    await other.click();
    await expect(page.locator('html')).not.toHaveAttribute('lang', /^en/);
    await expect(page).not.toHaveURL(/\/en(\/|$)/);
  });
});
