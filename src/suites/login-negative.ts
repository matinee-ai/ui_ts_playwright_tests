import type { Page } from '@playwright/test';
import type { SiteConfig } from '../../config/sites.ts';
import { expect, test } from '../fixtures.ts';
import { LoginForm } from '../helpers/login-form.ts';
import { sameSite } from '../utils/http.ts';

export interface LoginSuiteOptions {
  /** Brings up the sign-in form from a fresh page (dedicated page or modal). */
  open: (page: Page) => Promise<void>;
  /** The URL a rejected user must still be on. */
  stayOn: RegExp;
}

/** Account that cannot exist: example.com is reserved, the suffix is unique per run. */
const unknownAccount = () => `pw-no-such-user-${Date.now().toString(36)}@example.com`;
const ENUMERATION = /not (be )?found|doesn.?t exist|does not exist|not registered|no (such )?(user|account)|unknown (user|email)|не найден|не существует|не зарегистрирован/i;
const SQL_ERROR = /sql syntax|syntax error at or near|ORA-\d{5}|mysql_|pg_query|sqlite|unterminated quoted string|SQLSTATE/i;

/**
 * Registers negative sign-in tests. Wrong credentials go to the real backend
 * (that is what is being tested), at most four attempts per run, always with an
 * address on the reserved example.com domain.
 */
export function loginNegativeTests(site: SiteConfig, options: LoginSuiteOptions): void {
  test.describe(`${site.name}: sign-in rejects bad input`, () => {
    let login: LoginForm;
    let dialogs: string[];
    let serverErrors: string[];

    test.beforeEach(async ({ page }) => {
      dialogs = [];
      serverErrors = [];
      page.on('dialog', (dialog) => {
        dialogs.push(`${dialog.type()}: ${dialog.message()}`);
        dialog.dismiss().catch(() => {});
      });
      page.on('response', (r) => {
        if (r.status() >= 500 && sameSite(r.url(), site.baseURL)) serverErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      });
      await options.open(page);
      login = await LoginForm.find(page);
    });

    /** Rejected = an error is shown, the user is still on the sign-in form, and no session exists. */
    async function expectRejected(page: Page): Promise<string[]> {
      await expect.poll(() => login.errors(), { message: 'an error message is shown', timeout: 15_000 }).not.toEqual([]);
      await expect(page, 'still on the sign-in page').toHaveURL(options.stayOn);
      await expect(login.password, 'sign-in form still shown').toBeVisible();
      expect(await login.sessionArtifacts(), 'no session cookie or token').toEqual([]);
      return login.errors();
    }

    test('empty email and password are rejected', { tag: '@critical' }, async ({ page }) => {
      await login.attempt('', '');
      await expectRejected(page);
    });

    test('malformed email addresses are rejected', async ({ page }) => {
      for (const email of ['plainaddress', 'user@', '@example.com']) {
        await test.step(email, async () => {
          await options.open(page);
          login = await LoginForm.find(page);
          await login.attempt(email, 'Valid-Passw0rd!');
          await expectRejected(page);
        });
      }
    });

    test('missing password is rejected', async ({ page }) => {
      await login.attempt(unknownAccount(), '');
      await expectRejected(page);
    });

    test('unknown account is rejected without signing in', { tag: '@critical' }, async ({ page }) => {
      await login.attempt(unknownAccount(), 'Wrong-Passw0rd!');
      await login.waitForAuthResponse();
      await expectRejected(page);
      expect(serverErrors, 'server errors while signing in').toEqual([]);
    });

    test('error for an unknown account does not reveal whether it exists', { tag: '@minor' }, async ({ page }) => {
      await login.attempt(unknownAccount(), 'Wrong-Passw0rd!');
      await login.waitForAuthResponse();
      const errors = await expectRejected(page);
      expect(errors.join(' | '), 'message should be generic, e.g. "Invalid email or password"').not.toMatch(ENUMERATION);
    });

    test('SQL injection and script payloads are rejected safely', { tag: ['@critical', '@security'] }, async ({ page }) => {
      const payloads = [
        { email: "admin'--@example.com", password: "' OR '1'='1" },
        { email: '"><img src=x onerror=alert(1)>@example.com', password: '<script>alert(1)</script>' },
      ];
      for (const payload of payloads) {
        await test.step(payload.email, async () => {
          await options.open(page);
          login = await LoginForm.find(page);
          await login.attempt(payload.email, payload.password);
          await login.waitForAuthResponse(5_000);
          await expectRejected(page);
        });
      }
      expect(dialogs, 'no injected script ran').toEqual([]);
      expect(await page.locator('img[src="x"]').count(), 'payload not rendered as HTML').toBe(0);
      await expect(page.locator('body')).not.toContainText(SQL_ERROR);
      expect(serverErrors, 'server errors caused by the payloads').toEqual([]);
    });

    test('password is masked and never sent in the URL', { tag: '@critical' }, async ({ page }) => {
      await expect(login.password).toHaveAttribute('type', 'password');
      expect.soft(await login.password.getAttribute('autocomplete'), 'lets password managers fill it').toMatch(/current-password|on/);

      const secret = `Secret-${Date.now()}`;
      await login.attempt(unknownAccount(), secret);
      await login.waitForAuthResponse(5_000);
      expect(page.url(), 'page URL').not.toContain(secret);
      expect(login.authCalls().filter((c) => c.passwordInUrl).map((c) => c.url), 'requests with the password in the URL').toEqual([]);
    });

    test('fields have accessible labels', { tag: '@minor' }, async () => {
      await expect(login.identifier, 'email field is announced by name').toHaveAccessibleName(/\S/);
      await expect(login.password, 'password field is announced by name').toHaveAccessibleName(/\S/);
    });

    test('sign-in errors are announced to screen readers', { tag: '@minor' }, async ({ page }) => {
      await login.attempt(unknownAccount(), 'Wrong-Passw0rd!');
      await login.waitForAuthResponse();
      const shown = await expectRejected(page);
      expect(await login.announcedErrors(), `error "${shown.join(' | ')}" needs role="alert", aria-live or aria-invalid/aria-describedby`).not.toEqual([]);
    });

    test('very long input is handled gracefully', { tag: '@minor' }, async ({ page }) => {
      await login.attempt(`${'a'.repeat(300)}@example.com`, 'p'.repeat(300));
      await login.waitForAuthResponse(5_000);
      await expectRejected(page);
      expect(serverErrors, 'server errors caused by long input').toEqual([]);
    });
  });
}
