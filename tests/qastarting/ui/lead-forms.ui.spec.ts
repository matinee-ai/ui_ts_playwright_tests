import { expect, test } from '../../../src/fixtures.ts';
import { FormHelper } from '../../../src/helpers/forms.ts';
import { QaStartingSite } from '../../../src/pages/qastarting.ts';

// Submissions are intercepted by formSpy: no real lead is ever created.
const FORMS = [
  { name: '3 free lessons', section: 'free', submit: 'Get my 3 free lessons', kinds: ['name', 'email'] },
  { name: 'Callback request', section: 'contact', submit: 'Request a callback', kinds: ['name', 'phone'] },
];

for (const lead of FORMS) {
  test.describe(`QA Starting: "${lead.name}" form`, { tag: '@critical' }, () => {
    let form: FormHelper;

    test.beforeEach(async ({ page }) => {
      const site = new QaStartingSite(page);
      await site.open(`/#${lead.section}`);
      form = await FormHelper.find(page, page.getByRole('button', { name: lead.submit }).locator('xpath=ancestor::form[1]'));
      const kinds = (await form.fields()).map((f) => f.kind);
      expect(kinds, 'form fields').toEqual(expect.arrayContaining(lead.kinds));
    });

    test('an empty form is not sent and shows what is missing', async ({ formSpy }) => {
      formSpy.arm();
      await form.submit();
      await formSpy.expectNoSubmission();
      expect(await form.validationErrors()).not.toEqual([]);
    });

    test('an invalid email or phone is rejected', async ({ formSpy }) => {
      await form.fill(formSpy.data, { email: 'not-an-email', phone: '12' });
      formSpy.arm();
      await form.submit();
      await formSpy.expectNoSubmission();
      expect(await form.validationErrors()).not.toEqual([]);
    });

    test('a complete form is sent with the entered details', async ({ formSpy }) => {
      await form.fill(formSpy.data);
      formSpy.arm();
      await form.submit();
      await formSpy.expectSubmission([formSpy.marker]);
    });
  });
}
