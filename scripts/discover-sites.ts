/**
 * Site discovery: crawls each site in a real browser and records what the
 * tests need to target. For every page: URL, status, title, headings, menu
 * links, buttons, forms and their fields, the API calls the page makes, an
 * accessibility snapshot and a screenshot. Pages that look like login or
 * sign-up pages are always included.
 *
 *   node scripts/discover-sites.ts <out-dir> [site ...]
 *
 * Used to calibrate page objects against the live markup (see .github/workflows/discover.yml).
 * Read-only: it never submits forms.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { SITE_LIST } from '../config/sites.ts';

const MAX_PAGES = 18;
const AUTH_LINK = /log ?in|sign ?in|sign ?up|register|account|profile|auth|войти|вход|регистрац|кабинет|увійти/i;

const [outDir = 'discovery-out', ...only] = process.argv.slice(2);
const sites = SITE_LIST.filter((s) => !only.length || only.includes(s.key));

interface PageInfo {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  lang: string | null;
  headings: Array<{ level: number; text: string }>;
  navLinks: Array<{ area: string; text: string; href: string; target: string | null }>;
  allLinkCount: number;
  buttons: string[];
  forms: Array<{ selector: string; action: string | null; method: string | null; fields: unknown[]; submit: string[] }>;
  passwordInputs: number;
  authLinks: Array<{ text: string; href: string }>;
  api: Array<{ method: string; url: string; status: number; type: string }>;
  consoleErrors: string[];
  aria: string;
  screenshot: string;
}

async function inspect(page: Page): Promise<Omit<PageInfo, 'url' | 'status' | 'api' | 'consoleErrors' | 'aria' | 'screenshot'>> {
  return page.evaluate((authSource) => {
    const auth = new RegExp(authSource, 'i');
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const areaOf = (a: Element) =>
      a.closest('header, [role="banner"]') ? 'header' : a.closest('footer, [role="contentinfo"]') ? 'footer' : a.closest('nav, [role="navigation"]') ? 'nav' : 'main';
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];
    const navLinks = anchors
      .filter((a) => areaOf(a) !== 'main')
      .map((a) => ({ area: areaOf(a), text: text(a) || a.getAttribute('aria-label') || '', href: a.href, target: a.getAttribute('target'), visible: shown(a) }))
      .slice(0, 80);
    const forms = [...document.querySelectorAll('form')].map((f, i) => ({
      selector: f.id ? `#${f.id}` : `form:nth-of-type(${i + 1})`,
      action: f.getAttribute('action'),
      method: f.getAttribute('method'),
      visible: shown(f),
      fields: [...f.querySelectorAll('input, textarea, select')].map((el) => {
        const input = el as HTMLInputElement;
        return {
          tag: el.tagName.toLowerCase(),
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder,
          label: text(input.labels?.[0] ?? null) || input.getAttribute('aria-label'),
          required: input.required,
          autocomplete: input.autocomplete,
          visible: shown(el),
        };
      }),
      submit: [...f.querySelectorAll('button, input[type="submit"]')].map((b) => text(b) || (b as HTMLInputElement).value),
    }));
    return {
      finalUrl: location.href,
      title: document.title,
      lang: document.documentElement.getAttribute('lang'),
      headings: [...document.querySelectorAll('h1, h2, h3')].filter(shown).slice(0, 40).map((h) => ({ level: Number(h.tagName[1]), text: text(h) })),
      navLinks,
      allLinkCount: anchors.length,
      buttons: [...document.querySelectorAll('button, [role="button"]')].filter(shown).map((b) => text(b) || b.getAttribute('aria-label') || '').filter(Boolean).slice(0, 40),
      forms,
      passwordInputs: document.querySelectorAll('input[type="password"]').length,
      authLinks: anchors.filter((a) => auth.test(text(a)) || auth.test(a.getAttribute('href') ?? '')).map((a) => ({ text: text(a), href: a.href })).slice(0, 20),
    };
  }, AUTH_LINK.source);
}

async function discover(site: (typeof SITE_LIST)[number]): Promise<void> {
  const dir = join(outDir, site.key);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'en-US' });
  const page = await context.newPage();
  const host = new URL(site.baseURL).hostname.replace(/^www\./, '');
  const sameSite = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '') === host;
    } catch {
      return false;
    }
  };

  const queue: string[] = [`${site.baseURL}${site.homePath}`];
  const seen = new Set<string>();
  const pages: PageInfo[] = [];
  const allApi = new Map<string, { method: string; url: string; status: number; type: string; pages: string[] }>();

  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift()!;
    const key = url.split('#')[0].replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);

    const api: PageInfo['api'] = [];
    const consoleErrors: string[] = [];
    const onResponse = (r: import('@playwright/test').Response) => {
      const type = r.request().resourceType();
      if (type === 'xhr' || type === 'fetch') api.push({ method: r.request().method(), url: r.url().slice(0, 300), status: r.status(), type: r.headers()['content-type'] ?? '' });
    };
    const onConsole = (m: import('@playwright/test').ConsoleMessage) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    };
    page.on('response', onResponse);
    page.on('console', onConsole);
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const info = await inspect(page);
      const n = String(pages.length).padStart(2, '0');
      const shot = `${n}-${new URL(info.finalUrl).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.jpg`;
      await page.screenshot({ path: join(dir, shot), type: 'jpeg', quality: 55, fullPage: true }).catch(() =>
        page.screenshot({ path: join(dir, shot), type: 'jpeg', quality: 55 }),
      );
      const aria = await page.locator('body').ariaSnapshot({ timeout: 10_000 }).catch((e) => `aria snapshot failed: ${e}`);
      pages.push({ url, status: response?.status() ?? null, ...info, api, consoleErrors, aria: aria.slice(0, 20_000), screenshot: shot });
      for (const call of api) {
        const k = `${call.method} ${call.url.split('?')[0]}`;
        const entry = allApi.get(k) ?? { ...call, pages: [] };
        entry.pages.push(info.finalUrl);
        allApi.set(k, entry);
      }

      // Login/sign-up pages first, then menu links, then other in-page links.
      const links = [...info.authLinks.map((l) => l.href), ...info.navLinks.map((l) => l.href)].filter(sameSite);
      const inPage = await page.$$eval('main a[href], body a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const link of [...links, ...inPage.filter(sameSite)]) {
        const k = link.split('#')[0].replace(/\/$/, '');
        if (!seen.has(k) && !queue.includes(link) && !/\.(pdf|jpe?g|png|gif|zip|webp|svg|js|css|xml|txt)$/i.test(k)) {
          if (AUTH_LINK.test(link)) queue.unshift(link);
          else queue.push(link);
        }
      }
    } catch (error) {
      pages.push({ url, status: null, finalUrl: url, title: `ERROR: ${(error as Error).message.split('\n')[0]}`, lang: null, headings: [], navLinks: [], allLinkCount: 0, buttons: [], forms: [], passwordInputs: 0, authLinks: [], api, consoleErrors, aria: '', screenshot: '' });
    } finally {
      page.off('response', onResponse);
      page.off('console', onConsole);
    }
  }

  writeFileSync(join(dir, 'pages.json'), JSON.stringify(pages, null, 2));
  writeFileSync(join(dir, 'api.json'), JSON.stringify([...allApi.values()], null, 2));
  console.log(`${site.key}: ${pages.length} pages, ${allApi.size} API endpoints, ${pages.filter((p) => p.passwordInputs).length} pages with password fields`);
  await browser.close();
}

for (const site of sites) await discover(site);
