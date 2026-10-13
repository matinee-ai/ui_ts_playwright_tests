import { expect, test } from '../../../src/fixtures.ts';
import { SpasSite } from '../../../src/pages/spas.ts';

// Submissions are intercepted by formSpy: no request ever reaches the mentors.
test.describe('Spas Life: "need help?" request form', () => {
  test('an empty request is not sent and shows what is missing', async ({ page, formSpy }) => {
    const site = new SpasSite(page);
    await site.openEnglish();
    const form = await site.openHelpForm();

    formSpy.arm();
    await form.submit();
    await formSpy.expectNoSubmission();
    expect(await form.validationErrors(), 'validation feedback').not.toEqual([]);
  });

  test('a complete request is sent with the entered contact details', async ({ page, formSpy }) => {
    const site = new SpasSite(page);
    await site.openEnglish();
    const form = await site.openHelpForm();
    const fields = await form.fill(formSpy.data);
    expect(fields.length, 'fillable fields').toBeGreaterThan(0);

    formSpy.arm();
    await form.submit();
    const sent = fields.some((f) => f.kind === 'email') ? [formSpy.data.email] : [formSpy.marker];
    await formSpy.expectSubmission(sent);
  });
});
