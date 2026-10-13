import { expect, test } from '../../../src/fixtures.ts';
import { FormHelper } from '../../../src/helpers/forms.ts';
import { SpasSite } from '../../../src/pages/spas.ts';

// Submissions are intercepted by formSpy: no request ever reaches the mentors.
const FORMS = [
  { name: 'request to join (RU)', path: '/register', submit: 'Отправить заявку' },
  { name: 'request to join (EN)', path: '/en/register', submit: 'Send request' },
  { name: 'contact form', path: '/contact', submit: 'Отправить сообщение' },
];

for (const { name, path, submit } of FORMS) {
  test.describe(`Spas Life: ${name}`, { tag: '@critical' }, () => {
    let form: FormHelper;

    test.beforeEach(async ({ page }) => {
      await new SpasSite(page).open(path);
      form = await FormHelper.find(page, page.getByRole('button', { name: submit }).locator('xpath=ancestor::form[1]'));
    });

    test('an empty form is not sent and shows what is missing', async ({ formSpy }) => {
      formSpy.arm();
      await form.submit();
      await formSpy.expectNoSubmission();
      expect(await form.validationErrors()).not.toEqual([]);
    });

    test('a complete form is sent with the entered details and an empty anti-spam field', async ({ formSpy }) => {
      const fields = await form.fill(formSpy.data);
      expect(fields.map((f) => f.label).join(' | '), 'honeypot "website" field is not filled').not.toMatch(/website/i);
      formSpy.arm();
      await form.submit();
      const sent = await formSpy.expectSubmission([formSpy.marker]);
      expect(sent.body, 'honeypot left empty').not.toMatch(/website=[^&\s]|"website"\s*:\s*"[^"]/);
    });
  });
}

test.describe('Spas Life: request form details', () => {
  test('the request is not sent without consent to data processing', { tag: '@critical' }, async ({ page, formSpy }) => {
    await new SpasSite(page).open('/en/register');
    const form = await FormHelper.find(page, page.getByRole('button', { name: 'Send request' }).locator('xpath=ancestor::form[1]'));
    await form.fill(formSpy.data);
    const consent = page.getByRole('checkbox', { name: /I consent to the processing/ });
    await consent.uncheck({ force: true }).catch(() => page.getByText(/I consent to the processing/).first().click());
    await expect(consent).not.toBeChecked();
    formSpy.arm();
    await form.submit();
    await formSpy.expectNoSubmission();
  });

  test('"Who needs help?" offers myself, a relative or another person', async ({ page }) => {
    await new SpasSite(page).open('/en/register');
    const who = page.getByRole('combobox', { name: 'Who needs help?' });
    await expect(who.getByRole('option')).toHaveText(['Myself', 'A relative', 'Another person']);
    await who.selectOption({ label: 'A relative' });
    await expect(who).toHaveValue(/.+/);
  });

  test('the register page offers direct contacts as an alternative', async ({ page }) => {
    await new SpasSite(page).open('/en/register');
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: '+1 (954) 501-0763' })).toHaveAttribute('href', 'tel:+19545010763');
    await expect(main.getByRole('link', { name: 'support@spas.life' })).toHaveAttribute('href', 'mailto:support@spas.life');
    await expect(main.getByRole('link', { name: '@spaslife_ch' })).toHaveAttribute('href', 'https://t.me/spaslife_ch');
  });
});
