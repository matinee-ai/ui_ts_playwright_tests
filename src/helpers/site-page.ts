import { test, type Locator, type Page, type Response } from '@playwright/test';
import type { SiteConfig } from '../../config/sites.ts';

const CONSENT_BUTTON =
  /^(accept( all)?( cookies)?|allow( all)?|agree|i agree|got it|ok|okay|понятно|принять( все)?|согласен|хорошо|прийняти|зрозуміло)$/i;

/** Behaviour shared by the page objects of all three sites. */
export class SitePage {
  constructor(
    readonly page: Page,
    readonly site: SiteConfig,
  ) {}

  async open(path = this.site.homePath): Promise<Response | null> {
    return test.step(`Open ${path}`, async () => {
      const response = await this.page.goto(path, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
      await this.dismissConsent();
      return response;
    });
  }

  /** Closes a cookie/consent banner if one is shown. */
  async dismissConsent(): Promise<void> {
    const button = this.page.getByRole('button', { name: CONSENT_BUTTON }).filter({ visible: true }).first();
    if (await button.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await button.click().catch(() => {});
    }
  }

  /**
   * Opens a section of the site the way a user would: by clicking the menu
   * link whose text matches `name`. If the link is hidden (collapsed menu) its
   * href is followed; if there is no such link the first live fallback path is used.
   */
  async openSection(name: RegExp, fallbackPaths: string[] = []): Promise<void> {
    await test.step(`Open section ${name}`, async () => {
      const visible = this.page.getByRole('link', { name }).filter({ visible: true }).first();
      if (await visible.count()) {
        const href = await visible.getAttribute('href');
        if ((await visible.getAttribute('target')) === '_blank' && href) {
          await this.open(href);
          return;
        }
        const before = this.page.url().split('#')[0];
        const target = href ? new URL(href, before).href.split('#')[0] : before;
        await visible.click();
        if (target !== before) await this.page.waitForURL((url) => url.href.split('#')[0] !== before, { timeout: 30_000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.dismissConsent();
        return;
      }
      const hidden = this.page.getByRole('link', { name, includeHidden: true }).first();
      const hiddenHref = (await hidden.count()) ? await hidden.getAttribute('href') : null;
      if (hiddenHref && !hiddenHref.startsWith('#')) {
        await this.open(hiddenHref);
        return;
      }
      for (const path of fallbackPaths) {
        const res = await this.page.request.get(new URL(path, this.site.baseURL).href, { failOnStatusCode: false });
        if (res.ok()) {
          await this.open(path);
          return;
        }
      }
      throw new Error(
        `No link matching ${name} on ${this.page.url()} and none of [${fallbackPaths.join(', ')}] exist. ` +
          `Update the page object for ${this.site.name}.`,
      );
    });
  }

  /** Same-site links in the header, navigation menus and footer. */
  async siteNavigationLinks(): Promise<string[]> {
    return this.page.evaluate((origin) => {
      const host = (h: string) => h.replace(/^www\./, '');
      const scopes = [...document.querySelectorAll('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"]')];
      const anchors = (scopes.length ? scopes : [document.body]).flatMap((s) => [...s.querySelectorAll('a[href]')]);
      const urls = anchors
        .map((a) => (a as HTMLAnchorElement).href.split('#')[0])
        .filter((href) => {
          try {
            const u = new URL(href);
            return /^https?:$/.test(u.protocol) && host(u.hostname) === host(new URL(origin).hostname);
          } catch {
            return false;
          }
        });
      return [...new Set(urls)];
    }, this.site.baseURL);
  }

  /**
   * A menu link the way a user reaches it: visible already, or after opening a
   * collapsed ("burger") menu, or after hovering its dropdown parent.
   */
  async revealLink(area: Locator, name: RegExp, parent?: RegExp): Promise<Locator> {
    const link = area.getByRole('link', { name }).filter({ visible: true }).first();
    if (await link.count()) return link;
    const toggle = area
      .getByRole('button', { name: /menu|меню|navigation/i })
      .or(area.locator('summary, [aria-label*="menu" i], [aria-label*="меню" i], [class*="burger" i], [class*="hamburger" i]'))
      .filter({ visible: true })
      .first();
    if (await toggle.count()) {
      await toggle.click();
      await link.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      if (await link.count()) return link;
    }
    if (parent) {
      await area.getByRole('link', { name: parent }).or(area.getByRole('button', { name: parent })).filter({ visible: true }).first().hover();
    }
    return link;
  }

  /** A visible element containing `text`, e.g. a section heading. */
  section(text: RegExp): Locator {
    return this.page.getByText(text).filter({ visible: true }).first();
  }

  /** All tel:/mailto:/Telegram links on the page. */
  async contactLinks(): Promise<{ tel: string[]; mailto: string[]; telegram: string[] }> {
    return this.page.evaluate(() => {
      const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
      return {
        tel: hrefs.filter((h) => h.toLowerCase().startsWith('tel:')),
        mailto: hrefs.filter((h) => h.toLowerCase().startsWith('mailto:')),
        telegram: hrefs.filter((h) => /^(https?:\/\/)?(t\.me|telegram\.me)\//i.test(h) || h.startsWith('tg:')),
      };
    });
  }
}
