import type { Locator, Page } from '@playwright/test';
import type { SiteConfig } from '../../config/sites.ts';
import { expect, test } from '../fixtures.ts';
import { SitePage } from '../helpers/site-page.ts';
import { escapeRegExp } from '../utils/html.ts';

/** One page of a site, as the navigation and link suites see it. */
export interface PageSpec {
  /** Readable name for test titles, e.g. "Ratings". */
  name: string;
  /** Path that opens the page directly, e.g. "/en/ratings". */
  path: string;
  /** Main heading of the page. */
  heading: RegExp;
  /** Level of that heading (default 1). */
  headingLevel?: number;
  /** Document title; defaults to "contains something". */
  title?: RegExp;
  /** Accessible name of the menu link that leads here; pages without one are only opened by URL. */
  menu?: RegExp;
  /** Where that link lives (default: header). */
  area?: 'header' | 'footer';
  /** Name of a menu item to hover first, for links inside a dropdown. */
  menuParent?: RegExp;
}

export interface NavigationOptions {
  /** Page the menu tests start from (default: the site's home path). */
  start?: string;
  /** Accessible name of the logo / home link in the header. */
  homeLink: RegExp;
  /** Pages to cover (aim for 5-10 of the most important ones). */
  pages: PageSpec[];
}

const normalize = (path: string) => decodeURI(path).replace(/\/+$/, '') || '/';

export function menuArea(page: Page, area: PageSpec['area'] = 'header'): Locator {
  return area === 'footer'
    ? page.locator('footer, [role="contentinfo"]').last()
    : page.locator('header, [role="banner"], nav').first();
}

/** Asserts the browser shows `spec`: URL path, main heading and title. `soft` keeps going after a mismatch. */
export async function expectOnPage(page: Page, spec: PageSpec, { soft = false } = {}): Promise<void> {
  const check = soft ? expect.soft : expect;
  await check(page, `URL of ${spec.name}`).toHaveURL((url) => normalize(url.pathname) === normalize(spec.path));
  const level = spec.headingLevel ?? 1;
  await check(page.getByRole('heading', { level, name: spec.heading }).first(), `h${level} of ${spec.name}`).toBeVisible();
  await check(page, `title of ${spec.name}`).toHaveTitle(spec.title ?? /\S/);
}

/**
 * Registers navigation tests: every menu link opens the right page, every page
 * opens by URL, browser history works, the logo leads home, unknown URLs get a 404 page.
 */
export function navigationTests(site: SiteConfig, options: NavigationOptions): void {
  const start = options.start ?? site.homePath;

  test.describe(`${site.name}: navigation`, () => {
    for (const spec of options.pages.filter((p) => p.menu)) {
      test(`menu link "${spec.name}" opens ${spec.path}`, async ({ page, pageErrors }) => {
        const sitePage = new SitePage(page, site);
        await sitePage.open(start);
        const link = await sitePage.revealLink(menuArea(page, spec.area), spec.menu!, spec.menuParent);
        await expect(link, `"${spec.name}" link in the ${spec.area ?? 'header'}`).toBeVisible();
        await expect(link).toHaveAttribute('href', new RegExp(`${escapeRegExp(spec.path)}/?($|[?#])`));

        await link.click();
        await expectOnPage(page, spec);
        expect(pageErrors.map((e) => e.message), 'uncaught script errors').toEqual([]);
      });
    }

    test('every page opens directly from its URL', async ({ page, pageErrors }) => {
      const sitePage = new SitePage(page, site);
      for (const spec of options.pages) {
        await test.step(spec.name, async () => {
          const response = await sitePage.open(spec.path);
          expect.soft(response?.status(), `HTTP status of ${spec.path}`).toBe(200);
          await expectOnPage(page, spec, { soft: true });
        });
      }
      expect(pageErrors.map((e) => e.message), 'uncaught script errors').toEqual([]);
    });

    test('browser back and forward restore pages in order', async ({ page }) => {
      const [first, second] = options.pages;
      const sitePage = new SitePage(page, site);
      await sitePage.open(start);
      await sitePage.open(first.path);
      await sitePage.open(second.path);

      await page.goBack();
      await expectOnPage(page, first);
      await page.goBack();
      await expect(page).toHaveURL((url) => normalize(url.pathname) === normalize(start));
      await page.goForward();
      await expectOnPage(page, first);
      await page.goForward();
      await expectOnPage(page, second);
    });

    test('logo link returns to the home page from any page', async ({ page }) => {
      const sitePage = new SitePage(page, site);
      for (const spec of options.pages.slice(0, 3)) {
        await test.step(`from ${spec.name}`, async () => {
          await sitePage.open(spec.path);
          await (await sitePage.revealLink(menuArea(page), options.homeLink)).click();
          await expect(page).toHaveURL((url) => normalize(url.pathname) === normalize(site.homePath));
        });
      }
    });

    test('every page has exactly one h1', { tag: '@minor' }, async ({ page }) => {
      const sitePage = new SitePage(page, site);
      const findings: string[] = [];
      for (const spec of options.pages) {
        await sitePage.open(spec.path);
        const count = await page.getByRole('heading', { level: 1 }).count();
        if (count !== 1) findings.push(`${spec.name} (${spec.path}): ${count} h1`);
      }
      expect(findings, 'one main heading per page helps screen readers and search engines').toEqual([]);
    });

    test('unknown URL shows a not-found page with a way back', { tag: '@minor' }, async ({ page }) => {
      const sitePage = new SitePage(page, site);
      const response = await sitePage.open(`${start.replace(/\/$/, '')}/pw-missing-${Date.now()}`);
      expect(response?.status()).toBe(404);
      await expect(page.locator('body')).toContainText(/404|not found|не найден|page.*(missing|exist)/i);
      const linksHome = await page.locator('a[href]').evaluateAll((anchors, home) => {
        const trim = (p: string) => p.replace(/\/+$/, '') || '/';
        return anchors.some((a) => {
          const url = new URL((a as HTMLAnchorElement).href);
          return a.getBoundingClientRect().width > 0 && url.origin === location.origin && (url.pathname === '/' || trim(url.pathname) === trim(home));
        });
      }, site.homePath);
      expect(linksHome, 'a visible link back to the home page').toBe(true);
    });
  });
}
