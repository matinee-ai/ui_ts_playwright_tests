import { expect, test } from '../../../src/fixtures.ts';
import { COURSES, QaStartingSite } from '../../../src/pages/qastarting.ts';

test.describe('QA Starting: courses', () => {
  for (const course of COURSES) {
    test(`${course.name} card opens a course page with its program`, async ({ page }) => {
      const site = new QaStartingSite(page);
      await site.open('/#courses');
      const card = site.byId('courses').getByRole('heading', { level: 3, name: course.name, exact: true }).locator('xpath=ancestor::*[.//a][1]');
      await card.getByRole('link', { name: /View details/ }).click();

      await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`));
      await expect(page.getByRole('heading', { level: 1, name: course.name, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Course program' })).toBeVisible();
      expect(await page.getByRole('heading', { level: 3, name: /^Module \d+ —/ }).count(), 'program modules').toBeGreaterThanOrEqual(4);
    });
  }

  test('a course page leads to checkout with that course selected', { tag: '@critical' }, async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.open('/courses/qa-advance');
    await page.getByRole('main').getByRole('link', { name: /enroll|buy|get started|sign up|choose/i }).first().click();
    await expect(page).toHaveURL(/\/checkout\?course=qa-advance/);
    await expect(site.orderPanel()).toContainText('QA ADVANCE');
    expect(await site.orderTotal(), 'order total').toBeGreaterThan(0);
  });
});
