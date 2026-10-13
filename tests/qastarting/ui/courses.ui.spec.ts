import { expect, test } from '../../../src/fixtures.ts';
import { COURSE_TRACKS, QaStartingSite } from '../../../src/pages/qastarting.ts';

test.describe('QA Starting: course catalogue', () => {
  test('lists every track of the learning path', async ({ page }) => {
    const site = new QaStartingSite(page);
    await site.openCourses();
    for (const track of COURSE_TRACKS) {
      await expect(page.getByText(new RegExp(track, 'i')).filter({ visible: true }).first(), track).toBeVisible();
    }
  });

  test('a course card opens its enrolment page with a booking form', async ({ page }) => {
    const site = new QaStartingSite(page);
    const form = await site.openEnrolment('QA BASIC');

    await expect(page.getByText(/QA BASIC/i).filter({ visible: true }).first()).toBeVisible();
    const kinds = (await form.fields()).map((f) => f.kind);
    expect(kinds, 'booking form asks how to reach the student').toEqual(
      expect.arrayContaining([expect.stringMatching(/email|phone/)]),
    );
  });
});
