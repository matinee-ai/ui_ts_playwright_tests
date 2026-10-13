import { SITES } from '../../../config/sites.ts';
import { expect, test } from '../../../src/fixtures.ts';
import { FormHelper } from '../../../src/helpers/forms.ts';
import { loginNegativeTests } from '../../../src/suites/login-negative.ts';

loginNegativeTests(SITES.chessorro, {
  open: async (page) => {
    await page.goto('/en/login');
  },
  stayOn: /\/en\/login/,
});

// Sign-up and password reset: all requests are intercepted (formSpy), so no account is ever created.
test.describe('Chessorro: sign-up and password reset reject bad input', () => {
  test('sign-up refuses a password shorter than 8 characters', { tag: '@critical' }, async ({ page, formSpy }) => {
    await page.goto('/en/signup');
    await page.getByRole('textbox', { name: 'Email' }).fill(formSpy.data.email);
    await page.getByRole('textbox', { name: 'Password' }).fill('Ab1!');
    formSpy.arm();
    await page.getByRole('button', { name: 'Create account' }).click();
    await formSpy.expectNoSubmission();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
    await expect(page).toHaveURL(/\/en\/signup/);
  });

  test('sign-up refuses a malformed email', async ({ page, formSpy }) => {
    await page.goto('/en/signup');
    await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
    await page.getByRole('textbox', { name: 'Password' }).fill('Long-enough-Passw0rd');
    formSpy.arm();
    await page.getByRole('button', { name: 'Create account' }).click();
    await formSpy.expectNoSubmission();
    const form = await FormHelper.find(page);
    expect(await form.validationErrors(), 'email error shown').not.toEqual([]);
  });

  test('password reset refuses an empty or malformed email', async ({ page, formSpy }) => {
    await page.goto('/en/forgot-password');
    formSpy.arm();
    for (const email of ['', 'not-an-email']) {
      await test.step(email || 'empty', async () => {
        await page.getByRole('textbox', { name: 'Email' }).fill(email);
        await page.getByRole('button', { name: 'Send reset link' }).click();
        await formSpy.expectNoSubmission(1_500);
        const form = await FormHelper.find(page);
        expect(await form.validationErrors(), 'email error shown').not.toEqual([]);
      });
    }
  });

  test('sign-in, sign-up and reset pages link to each other', async ({ page }) => {
    await page.goto('/en/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Create one' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
  });

  test('"Continue with Google" hands off to Google sign-in', async ({ page }) => {
    await page.goto('/en/login');
    // Stop at the hand-off: the test only checks where the button sends the user.
    await page.route(/accounts\.google\.com/, (route) => route.abort());
    const handOff = page.waitForRequest(/accounts\.google\.com|\/auth\/v1\/authorize|oauth|signin\/google/i, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    expect((await handOff).url()).toMatch(/google/i);
  });
});
