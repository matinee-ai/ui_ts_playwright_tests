import { test, type Locator, type Page, type Request, type Response } from '@playwright/test';

const SUBMIT = /^(log ?in|sign ?in|continue|next|submit|enter|войти|вход|увійти|продолжить)$/i;
/** Requests that look like an authentication call (REST, Firebase, Supabase, NextAuth, OAuth...). */
const AUTH_URL = /auth|login|log-in|signin|sign-in|session|token|identitytoolkit|securetoken|oauth|credentials|account/i;

export interface AuthCall {
  method: string;
  url: string;
  status: number | null;
  /** True when the password typed in the form travels in the URL (query string). */
  passwordInUrl: boolean;
}

/**
 * Login form driver. Finds the form by its password field, so it works for
 * email/username/phone logins, modal dialogs and dedicated login pages alike.
 */
export class LoginForm {
  readonly calls: AuthCall[] = [];
  private lastPassword = '';

  private constructor(
    readonly page: Page,
    readonly root: Locator,
    readonly identifier: Locator,
    readonly password: Locator,
    readonly submitButton: Locator,
  ) {
    page.on('request', (r) => this.track(r));
    page.on('response', (r) => this.trackResponse(r));
  }

  static async find(page: Page, { timeout = 15_000 } = {}): Promise<LoginForm> {
    const password = page.locator('input[type="password"]').filter({ visible: true }).first();
    await password.waitFor({ state: 'visible', timeout });
    // The login form: nearest <form> around the password field, else the nearest block that has a button.
    const form = password.locator('xpath=ancestor::form[1]');
    const root = (await form.count()) ? form : password.locator('xpath=ancestor::*[.//button or .//*[@role="button"] or .//input[@type="submit"]][1]');
    const identifier = root
      .locator(
        'input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name*="email" i], input[name*="login" i], input[name*="user" i], input[id*="email" i], input[placeholder*="mail" i], input[type="tel"], input[type="text"]',
      )
      .filter({ visible: true })
      .first();
    const submitButton = root
      .locator('button[type="submit"], input[type="submit"]')
      .or(root.getByRole('button', { name: SUBMIT }))
      .filter({ visible: true })
      .first();
    return new LoginForm(page, root, identifier, password, submitButton);
  }

  async attempt(identifier: string, password: string): Promise<void> {
    await test.step(`Log in as "${identifier.slice(0, 40)}"`, async () => {
      this.lastPassword = password;
      await this.identifier.fill(identifier);
      await this.password.fill(password);
      await this.submitButton.click();
    });
  }

  /** Auth requests made since the form was found. */
  authCalls(): AuthCall[] {
    return this.calls;
  }

  /** Waits for the server to answer an auth call; returns it (or null if the form never called the server). */
  async waitForAuthResponse(timeout = 15_000): Promise<AuthCall | null> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const answered = this.calls.find((c) => c.status !== null);
      if (answered) return answered;
      await this.page.waitForTimeout(250);
    }
    return null;
  }

  /** Visible error feedback: alerts, error-styled text and invalid fields (with the browser's message). */
  async errors(): Promise<string[]> {
    return this.root.evaluate((root) => {
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const scope = root.closest('[role="dialog"], main, body') ?? root;
      const out: string[] = [];
      root.querySelectorAll('input').forEach((el) => {
        const input = el as HTMLInputElement;
        if (shown(input) && (input.getAttribute('aria-invalid') === 'true' || (input.willValidate && !input.checkValidity()))) {
          out.push(`${input.type}: ${input.validationMessage || 'invalid'}`);
        }
      });
      scope.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"], [class*="error" i], [class*="invalid" i], [class*="danger" i], [data-testid*="error" i]').forEach((el) => {
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text && shown(el) && !(el instanceof HTMLInputElement)) out.push(text.slice(0, 160));
      });
      return [...new Set(out)];
    });
  }

  /** Something that looks like a logged-in session: auth cookies or tokens in web storage. */
  async sessionArtifacts(): Promise<string[]> {
    const cookies = (await this.page.context().cookies())
      .filter((c) => /session|auth|token|jwt|sid|access|refresh/i.test(c.name) && c.value.length > 15)
      .map((c) => `cookie ${c.name}`);
    const storage = await this.page.evaluate(() => {
      const found: string[] = [];
      for (const store of [localStorage, sessionStorage]) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i)!;
          const value = store.getItem(key) ?? '';
          if (/token|auth|session|user/i.test(key) && /ey[A-Za-z0-9_-]{10,}\.|"(access|id|refresh)_?token"\s*:\s*"[^"]{10,}/i.test(value)) found.push(`storage ${key}`);
        }
      }
      return found;
    });
    return [...cookies, ...storage];
  }

  private track(request: Request): void {
    const method = request.method();
    const isAuth = AUTH_URL.test(request.url()) && method !== 'GET' && method !== 'OPTIONS';
    const carriesPassword = !!this.lastPassword && decodeURIComponentSafe(request.url()).includes(this.lastPassword);
    if (!isAuth && !carriesPassword && !(method === 'POST' && request.resourceType() === 'document')) return;
    this.calls.push({ method, url: request.url(), status: null, passwordInUrl: carriesPassword });
  }

  private trackResponse(response: Response): void {
    const call = this.calls.find((c) => c.url === response.url() && c.status === null);
    if (call) call.status = response.status();
  }
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
