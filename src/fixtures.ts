import { test as base, expect, type Page, type Request } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { SITES, type SiteKey } from '../config/sites.ts';

/**
 * Third-party trackers are blocked in UI runs (set BLOCK_ANALYTICS=0 to allow):
 * daily automated visits should not inflate the sites' analytics, and these
 * scripts are a common source of slowness that has nothing to do with the site.
 */
const ANALYTICS = [
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.google.com',
  'doubleclick.net',
  'mc.yandex.ru',
  'mc.yandex.com',
  'connect.facebook.net',
  'facebook.com/tr',
  'clarity.ms',
  'hotjar.com',
  'hotjar.io',
  'vercel-insights.com',
  'plausible.io',
  'tiktok.com/i18n/pixel',
  'analytics.tiktok.com',
  'bat.bing.com',
  'sentry.io',
  '/cdn-cgi/rum',
  '/_vercel/insights',
  '/_vercel/speed-insights',
  'stat.tildaapi.com',
  'tildastat',
];

const isAnalytics = (url: string) => ANALYTICS.some((host) => url.includes(host));

/** Bot-protection services forms depend on (Cloudflare Turnstile, reCAPTCHA, hCaptcha): never intercepted. */
const BOT_PROTECTION = ['challenges.cloudflare.com', 'google.com/recaptcha', 'gstatic.com/recaptcha', 'hcaptcha.com'];
const isBotProtection = (url: string) => BOT_PROTECTION.some((host) => url.includes(host));

export interface CapturedSubmission {
  method: string;
  url: string;
  body: string;
}

/**
 * Stops form submissions from reaching production. While armed, every
 * non-GET request (and any GET carrying our marker) is answered locally with
 * a 200 and recorded, so tests can assert on what the form would have sent.
 */
export class FormSpy {
  /** Alphanumeric, so it survives URL/JSON/multipart encoding unchanged. */
  readonly marker = `pwqa${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  readonly submissions: CapturedSubmission[] = [];
  private armed = false;

  constructor(private readonly page: Page) {}

  /** Test data that is easy to recognise (and filter out) if it ever leaks. */
  get data() {
    return {
      name: `Playwright ${this.marker}`,
      email: `${this.marker}@example.com`,
      phone: '2025550143',
      message: `Automated test, please ignore (${this.marker})`,
    };
  }

  async install(): Promise<void> {
    await this.page.route('**/*', async (route) => {
      const request = route.request();
      if (!this.armed || !this.isSubmission(request)) return route.fallback();
      this.submissions.push({ method: request.method(), url: request.url(), body: bodyOf(request) });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ ok: true, success: true, message: 'captured by playwright' }),
      });
    });
  }

  /** Start intercepting. Call right before the action that may submit. */
  arm(): void {
    this.armed = true;
  }

  /** Waits until a captured request contains every value, then returns it. */
  async expectSubmission(values: string[], timeout = 10_000): Promise<CapturedSubmission> {
    await expect
      .poll(() => this.submissions.some((s) => containsAll(s, values)), {
        timeout,
        message: `form submission containing ${values.join(', ')} (captured: ${this.submissions.map((s) => s.url).join(', ') || 'none'})`,
      })
      .toBe(true);
    const submission = this.submissions.find((s) => containsAll(s, values))!;
    await base.info().attach('captured form submission', {
      body: JSON.stringify(submission, null, 2),
      contentType: 'application/json',
    });
    return submission;
  }

  /** Asserts nothing was sent within `ms` (e.g. after submitting an invalid form). */
  async expectNoSubmission(ms = 2_500): Promise<void> {
    await this.page.waitForTimeout(ms);
    expect(this.submissions, 'form must not be sent while it has validation errors').toEqual([]);
  }

  private isSubmission(request: Request): boolean {
    const method = request.method();
    if (method === 'OPTIONS' || isAnalytics(request.url()) || isBotProtection(request.url())) return false;
    if (method === 'GET' || method === 'HEAD') return decodeSafe(request.url()).includes(this.marker);
    return true;
  }
}

function bodyOf(request: Request): string {
  const raw = request.postDataBuffer()?.toString('utf8') ?? '';
  return `${raw}\n${decodeSafe(raw.replace(/\+/g, ' '))}\n${decodeSafe(request.url())}`;
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function containsAll(submission: CapturedSubmission, values: string[]): boolean {
  const body = submission.body.toLowerCase();
  return values.every((v) => body.includes(v.toLowerCase()));
}

const SEVERITIES = ['blocker', 'critical', 'normal', 'minor', 'trivial'];

interface Fixtures {
  /** Uncaught exceptions thrown by page scripts. */
  pageErrors: Error[];
  formSpy: FormSpy;
  /** Labels every test for the Allure report: epic = site, feature = API/UI, story = describe block. */
  allureMetadata: void;
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    if (process.env.BLOCK_ANALYTICS !== '0') {
      await page.route(
        (url) => isAnalytics(url.href),
        (route) => route.abort('blockedbyclient'),
      );
    }
    await use(page);
  },
  pageErrors: async ({ page }, use) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await use(errors);
  },
  formSpy: async ({ page }, use) => {
    const spy = new FormSpy(page);
    await spy.install();
    await use(spy);
  },
  allureMetadata: [
    async ({}, use, testInfo) => {
      const [key, layer] = testInfo.project.name.split('-');
      const site = SITES[key as SiteKey];
      await allure.epic(site ? site.name : 'Framework self-tests');
      await allure.feature(layer === 'api' ? 'API' : layer === 'ui' ? 'UI' : testInfo.project.name);
      // titlePath: [file, ...describe blocks, test title]; "Chessorro: offline board" -> "offline board"
      const describe = testInfo.titlePath.slice(1, -1)[0];
      if (describe) await allure.story(describe.replace(/^[^:]+:\s*/, ''));
      // Severity comes from tags: test.describe('...', { tag: '@critical' }, ...)
      const tagged = testInfo.tags.map((t) => t.replace(/^@/, '')).find((t) => SEVERITIES.includes(t));
      await allure.severity(tagged ?? 'normal');
      if (site) await allure.link(`${site.baseURL}${site.homePath}`, site.name);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
