import { expect, test } from '../../../src/fixtures.ts';
import { QaStartingSite } from '../../../src/pages/qastarting.ts';

test.describe('QA Starting: interactive sections', () => {
  test('the career quiz walks through its questions to a result', async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open('/#quiz');
    const quiz = site.byId('quiz');
    await quiz.getByRole('button', { name: 'Take the quiz' }).click();

    // Answer every question with its first option until a result appears (12 questions advertised).
    for (let i = 0; i < 14; i++) {
      const options = quiz.getByRole('button').filter({ hasNotText: /^(back|next|previous|restart|start over|take the quiz)$/i }).or(quiz.getByRole('radio'));
      if (await quiz.getByText(/result|your score|you are|great fit|ready for qa/i).first().isVisible().catch(() => false)) break;
      await expect(options.first(), `answer options for question ${i + 1}`).toBeVisible();
      await options.first().click();
      const next = quiz.getByRole('button', { name: /^(next|continue|finish|see result)/i });
      if (await next.isVisible().catch(() => false)) await next.click();
    }
    await expect(quiz.getByText(/result|your score|you are|fit|ready/i).first(), 'quiz result').toBeVisible();
  });

  test('success stories can be filtered by audience', async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open('/#stories');
    const stories = site.byId('stories');
    const filter = (name: string) => stories.getByRole('button', { name, exact: true });
    const cards = stories.getByText(/✓ Result:/);
    const all = await cards.count();
    expect(all, 'stories listed').toBeGreaterThan(5);

    await filter('Parents').click();
    await expect.poll(() => cards.count(), { message: 'fewer stories after filtering' }).toBeLessThan(all);
    const shown = await cards.count();
    expect(shown, 'at least one parent story').toBeGreaterThan(0);

    await filter('All').click();
    await expect.poll(() => cards.count()).toBe(all);
  });

  test('switching to Russian translates the page, and back to English', async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open();
    const toggle = page.getByRole('navigation').first().getByRole('button', { name: /RU\s*\/\s*EN|русский|english/i });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^ru/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/[а-яё]/i);
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  });

  test('controls are labelled in the page language', { tag: '@minor' }, async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open();
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
    const names = await page.getByRole('button').evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute('aria-label') ?? '').filter((label) => /[а-яё]/i.test(label)),
    );
    expect(names, 'Russian accessible names on the English page').toEqual([]);
  });
});
