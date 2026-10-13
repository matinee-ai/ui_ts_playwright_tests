import { devices } from '@playwright/test';
import type { SiteConfig } from '../../config/sites.ts';
import { expect, test } from '../fixtures.ts';
import { SitePage } from '../helpers/site-page.ts';
import { brokenUrls, sameSite } from '../utils/http.ts';

const LANGUAGE_LABEL: Record<string, RegExp> = {
  en: /^(en|eng|english)$/i,
  ru: /^(ru|rus|русский|рус)$/i,
  uk: /^(ua|uk|ukr|українська|укр)$/i,
  es: /^(es|español|espanol)$/i,
  de: /^(de|deutsch)$/i,
  fr: /^(fr|français|francais)$/i,
};

/** Registers the browser checks every site must pass. */
export function commonUiTests(site: SiteConfig, { languageSwitch = true } = {}): void {
  test.describe(`${site.name}: common UI`, () => {
    test('landing page renders without script errors or failed requests', { tag: '@critical' }, async ({ page, pageErrors }) => {
      const failed: string[] = [];
      page.on('response', (r) => {
        if (r.status() >= 400 && sameSite(r.url(), site.baseURL)) failed.push(`${r.status()} ${r.url()}`);
      });
      page.on('requestfailed', (r) => {
        const reason = r.failure()?.errorText ?? '';
        if (sameSite(r.url(), site.baseURL) && !/aborted|blockedbyclient/i.test(reason)) failed.push(`${reason} ${r.url()}`);
      });

      const sitePage = new SitePage(page, site);
      const response = await sitePage.open();
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator('body')).toBeVisible();

      // Scroll through the page so lazy sections load (and can fail) too.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 150));
        }
      });
      await page.waitForTimeout(1_000);

      expect(pageErrors.map((e) => e.message), 'uncaught exceptions').toEqual([]);
      expect(failed, 'failed same-site requests').toEqual([]);
    });

    test('header, menu and footer links lead to live pages', async ({ page }) => {
      const sitePage = new SitePage(page, site);
      await sitePage.open();
      const links = await sitePage.siteNavigationLinks();
      expect(links.length, 'navigation links found').toBeGreaterThan(0);
      expect(await brokenUrls(page.request, links)).toEqual([]);
    });

    if (languageSwitch) test('language switcher changes the page language', { tag: '@minor' }, async ({ page }) => {
      const sitePage = new SitePage(page, site);
      await sitePage.open();
      const startLang = ((await page.locator('html').getAttribute('lang')) ?? '').toLowerCase().split('-')[0];

      // Candidate switcher links: hreflang alternates, else links labelled like "EN" / "Русский".
      const switcher = await page.evaluate(
        ({ start, labels }) => {
          const current = location.href.split('#')[0];
          const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];
          const fromHreflang = [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')]
            .map((l) => ({ lang: l.hreflang.toLowerCase().split('-')[0], href: l.href }))
            .filter((l) => l.lang !== 'x' && l.lang !== start && l.href !== current);
          for (const alt of fromHreflang) {
            const path = new URL(alt.href).pathname.replace(/\/$/, '');
            const a = anchors.find((x) => x.href === alt.href || new URL(x.href).pathname.replace(/\/$/, '') === path);
            if (a) {
              a.setAttribute('data-pw-lang', alt.lang);
              return alt.lang;
            }
          }
          for (const a of anchors) {
            const label = (a.textContent ?? '').trim();
            const lang = Object.entries(labels).find(([, re]) => new RegExp(re, 'i').test(label))?.[0];
            if (lang && lang !== start && a.href.split('#')[0] !== current) {
              a.setAttribute('data-pw-lang', lang);
              return lang;
            }
          }
          return null;
        },
        { start: startLang, labels: Object.fromEntries(Object.entries(LANGUAGE_LABEL).map(([k, v]) => [k, v.source])) },
      );
      test.skip(!switcher, 'No language switcher on the landing page');

      const link = page.locator('[data-pw-lang]').first();
      if (!(await link.isVisible())) {
        // Collapsed language dropdown: open it via the control showing the current language.
        const toggle = page.getByText(LANGUAGE_LABEL[startLang] ?? /^(en|ru)$/i).filter({ visible: true }).first();
        if (await toggle.count()) await toggle.click();
      }
      const before = page.url();
      await link.click();
      await page.waitForURL((url) => url.href !== before);
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${switcher}`, 'i'));
    });

    const { emails, phones, telegram } = site.contacts;
    if (emails.length + phones.length + telegram.length) {
      test('contact details are clickable links', { tag: '@critical' }, async ({ page }) => {
        const sitePage = new SitePage(page, site);
        await sitePage.open();
        const links = await sitePage.contactLinks();
        const digits = (s: string) => s.replace(/\D/g, '');

        for (const email of emails) {
          expect(links.mailto.map((h) => h.toLowerCase()), `mailto: link for ${email}`).toContainEqual(
            expect.stringContaining(email),
          );
        }
        for (const phone of phones) {
          expect(links.tel.some((h) => digits(h).endsWith(phone.slice(-10))), `tel: link for +${phone} in ${links.tel}`).toBe(true);
        }
        for (const handle of telegram) {
          expect(links.telegram.some((h) => h.toLowerCase().includes(handle)), `Telegram link to @${handle}`).toBe(true);
        }
      });
    }

    test.describe('mobile', () => {
      const { defaultBrowserType: _, ...pixel7 } = devices['Pixel 7'];
      test.use(pixel7);

      test('no horizontal scrolling and the menu is reachable', async ({ page }) => {
        const sitePage = new SitePage(page, site);
        await sitePage.open();

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'page is wider than the phone screen').toBeLessThanOrEqual(1);

        // Either the menu links are visible already, or a burger button reveals more links.
        const navLinks = page.locator('header a[href], nav a[href], [role="navigation"] a[href]').filter({ visible: true });
        if ((await navLinks.count()) === 0) {
          const visibleLinks = page.locator('a[href]').filter({ visible: true });
          const before = await visibleLinks.count();
          const burger = page
            .getByRole('button', { name: /menu|navigation|меню/i })
            .or(page.locator('[class*="burger" i], [class*="hamburger" i], [aria-label*="menu" i], [aria-controls*="menu" i], [class*="menu-toggle" i]'))
            .filter({ visible: true })
            .first();
          await expect(burger, 'menu button on mobile').toBeVisible();
          await burger.click();
          await expect
            .poll(() => visibleLinks.count(), { message: 'opening the menu shows its links' })
            .toBeGreaterThan(before);
        }
      });
    });
  });
}
