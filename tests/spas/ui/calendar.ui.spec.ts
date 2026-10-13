import { expect, test } from '../../../src/fixtures.ts';
import { SpasSite, parseRussianDate } from '../../../src/pages/spas.ts';

const DAY = 86_400_000;

test.describe('Spas Life: church calendar', () => {
  test('"today" shows the current date', { tag: '@critical' }, async ({ page }) => {
    const site = new SpasSite(page);
    await site.open('/orthodoxy/calendar');
    const shown = parseRussianDate(await site.calendarDay().getByRole('heading', { level: 2 }).innerText());
    expect(shown, 'date in the calendar heading').not.toBeNull();
    const now = Date.now();
    const daysOff = Math.round((shown!.getTime() - Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())) / DAY);
    // One day of slack for time zones (the site serves Russia and the US).
    expect(Math.abs(daysOff), `calendar shows ${shown!.toISOString().slice(0, 10)}, ${daysOff} day(s) from today`).toBeLessThanOrEqual(1);
  });

  test('the old-style date is 13 days behind the civil date', async ({ page }) => {
    const site = new SpasSite(page);
    await site.open('/orthodoxy/calendar');
    const day = site.calendarDay();
    const civil = parseRussianDate(await day.getByRole('heading', { level: 2 }).innerText())!;
    const oldStyleText = await day.getByText(/\(ст\.\s*ст\.\)/).first().innerText();
    const oldStyle = parseRussianDate(oldStyleText, civil.getUTCFullYear() - (civil.getUTCMonth() === 0 && /декабря/.test(oldStyleText) ? 1 : 0))!;
    expect((civil.getTime() - oldStyle.getTime()) / DAY, `${oldStyleText} vs civil date`).toBe(13);
  });

  test('switching between old and new style keeps the calendar working', async ({ page }) => {
    const site = new SpasSite(page);
    await site.open('/orthodoxy/calendar');
    await page.getByRole('group', { name: 'Стиль календаря' }).getByRole('link', { name: 'Новый стиль' }).click();
    await expect(page).toHaveURL(/\/orthodoxy\/calendar\/new-style$/);
    await expect(site.calendarDay().getByRole('heading', { level: 2 })).toHaveText(/\d{1,2} [а-яё]+ \d{4}/i);
    await page.getByRole('group', { name: 'Стиль календаря' }).getByRole('link', { name: 'Старый стиль' }).click();
    await expect(page).toHaveURL(/\/orthodoxy\/calendar$/);
  });

  test('the month view opens for the current month', async ({ page }) => {
    const site = new SpasSite(page);
    await site.open('/orthodoxy/calendar');
    const link = page.getByRole('link', { name: 'Календарь на месяц' });
    const month = new Date().toISOString().slice(0, 7);
    await expect(link, 'links to this month').toHaveAttribute('href', new RegExp(`/orthodoxy/calendar/${month}$`));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/orthodoxy/calendar/${month}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a reading expands to show its text', async ({ page }) => {
    const site = new SpasSite(page);
    await site.open('/orthodoxy/calendar');
    const readings = page.getByRole('region', { name: 'Чтения дня' });
    const toggle = readings.getByText('Показать текст').first();
    await toggle.click();
    const reading = toggle.locator('xpath=ancestor::details[1]');
    await expect(reading).toHaveAttribute('open', '');
    expect((await reading.innerText()).length, 'reading text shown').toBeGreaterThan(80);
  });
});
