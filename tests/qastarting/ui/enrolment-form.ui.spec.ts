import { expect, test } from '../../../src/fixtures.ts';
import { QaStartingSite } from '../../../src/pages/qastarting.ts';

// Submissions are intercepted by formSpy: no real lead is ever created.
test.describe('QA Starting: enrolment form', { tag: '@critical' }, () => {
  test('an empty form is not sent and shows what is missing', async ({ page, formSpy }) => {
    const form = await new QaStartingSite(page).openEnrolment('QA BASIC');
    formSpy.arm();
    await form.submit();
    await formSpy.expectNoSubmission();
    expect(await form.validationErrors(), 'validation feedback').not.toEqual([]);
  });

  test('an invalid email address is rejected', async ({ page, formSpy }) => {
    const form = await new QaStartingSite(page).openEnrolment('QA BASIC');
    const fields = await form.fill(formSpy.data, { email: 'not-an-email' });
    test.skip(!fields.some((f) => f.kind === 'email'), 'The form has no email field');

    formSpy.arm();
    await form.submit();
    await formSpy.expectNoSubmission();
    expect(await form.validationErrors(), 'validation feedback').not.toEqual([]);
  });

  test('a complete enrolment is sent with the entered details', async ({ page, formSpy }) => {
    const form = await new QaStartingSite(page).openEnrolment('QA BASIC');
    const fields = await form.fill(formSpy.data);
    expect(fields.length, 'fillable fields').toBeGreaterThan(0);

    formSpy.arm();
    await form.submit();
    const sent = fields.some((f) => f.kind === 'email') ? [formSpy.data.email] : [formSpy.marker];
    const submission = await formSpy.expectSubmission(sent);
    expect(submission.method).toMatch(/POST|PUT/);
  });
});
