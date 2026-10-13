import { expect, test } from '../../../src/fixtures.ts';
import { QaStartingSite } from '../../../src/pages/qastarting.ts';

test.describe('QA Starting: FAQ', { tag: '@minor' }, () => {
  test('questions expand to reveal their answers and collapse again', async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open();

    const question = site.faqQuestions().first();
    await question.scrollIntoViewIfNeeded();
    await expect(question, 'expandable FAQ question').toBeVisible();

    const isSummary = await question.evaluate((el) => el.tagName === 'SUMMARY');
    const controls = await question.getAttribute('aria-controls');
    const answer = isSummary
      ? question.locator('xpath=..').locator(':scope > :not(summary)').first()
      : controls
        ? page.locator(`[id="${controls}"]`)
        : question.locator('xpath=following-sibling::*[1] | ../following-sibling::*[1]').first();

    await question.click();
    if (!isSummary) await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(answer).toBeVisible();
    await expect(answer).not.toHaveText(/^\s*$/);

    await question.click();
    if (!isSummary) await expect(question).toHaveAttribute('aria-expanded', 'false');
    await expect(answer).toBeHidden();
  });
});
