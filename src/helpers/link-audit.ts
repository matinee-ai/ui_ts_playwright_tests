import { test, type APIRequestContext, type Page } from '@playwright/test';
import { brokenUrls, type UrlCheck } from '../utils/http.ts';

export interface AuditedLink {
  index: number;
  name: string;
  href: string;
  /** Resolved absolute URL ('' for javascript:, empty and fragment-only hrefs). */
  url: string;
  kind: 'internal' | 'external' | 'mailto' | 'tel' | 'fragment' | 'javascript' | 'empty' | 'other';
  target: string | null;
  rel: string;
  area: 'header' | 'nav' | 'main' | 'footer';
}

export interface LinkAudit {
  page: string;
  links: AuditedLink[];
  /** Visible links with no text, aria-label, title or image alt. */
  unnamed: AuditedLink[];
  /** href="", "#" or "javascript:" on something that is not a button. */
  dead: AuditedLink[];
  /** Links that fail Playwright's actionability check: hidden behind another element, disabled, moving. */
  notClickable: Array<AuditedLink & { reason: string }>;
  /** Internal/external URLs answering >= 400 or not at all. */
  broken: UrlCheck[];
  /** target=_blank without rel=noopener/noreferrer (reverse tabnabbing on old browsers). */
  unsafeBlank: AuditedLink[];
  /** mailto:/tel: links whose address can't be valid. */
  malformedContact: AuditedLink[];
  /** In-page links (#section) whose target element doesn't exist. */
  missingAnchors: AuditedLink[];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Audits every visible link on the current page. `checkHttp` also requests
 * each distinct internal (and optionally external) URL; `clickSample` limits
 * how many links get the actionability check.
 */
export async function auditLinks(
  page: Page,
  request: APIRequestContext,
  { checkHttp = true, checkExternal = false, clickSample = 40 } = {},
): Promise<LinkAudit> {
  return test.step(`Audit links on ${new URL(page.url()).pathname}`, async () => {
    const links = await page.evaluate(() => {
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
      };
      const host = (h: string) => h.replace(/^www\./, '');
      return [...document.querySelectorAll<HTMLAnchorElement>('a[href], a[role="link"]')]
        .map((a, i) => {
          a.setAttribute('data-pw-link', String(i));
          const href = a.getAttribute('href') ?? '';
          const name = (
            a.getAttribute('aria-label') ||
            (a.textContent ?? '').replace(/\s+/g, ' ').trim() ||
            a.getAttribute('title') ||
            [...a.querySelectorAll('img[alt], svg[aria-label], [aria-label]')].map((x) => x.getAttribute('alt') || x.getAttribute('aria-label')).join(' ')
          ).trim();
          let kind = 'other';
          let url = '';
          if (!href.trim()) kind = 'empty';
          else if (/^javascript:/i.test(href)) kind = 'javascript';
          else if (href.startsWith('#')) kind = 'fragment';
          else if (/^mailto:/i.test(href)) kind = 'mailto';
          else if (/^tel:/i.test(href)) kind = 'tel';
          else {
            try {
              const u = new URL(href, location.href);
              url = u.href.split('#')[0];
              kind = /^https?:$/.test(u.protocol) ? (host(u.hostname) === host(location.hostname) ? 'internal' : 'external') : 'other';
            } catch {
              kind = 'other';
            }
          }
          const area = a.closest('header, [role="banner"]') ? 'header' : a.closest('footer, [role="contentinfo"]') ? 'footer' : a.closest('nav, [role="navigation"]') ? 'nav' : 'main';
          // "#pricing" must point at an element on this page; "#" alone and SPA routes like "#/login" are not anchors.
          const anchor = kind === 'fragment' && /^#[^/]/.test(href) ? decodeURIComponent(href.slice(1)) : '';
          const anchorMissing = !!anchor && !document.getElementById(anchor) && !document.getElementsByName(anchor).length;
          return { index: i, name, href, url, kind, target: a.getAttribute('target'), rel: a.getAttribute('rel') ?? '', area, visible: shown(a), isButton: a.getAttribute('role') === 'button', anchorMissing };
        })
        .filter((l) => l.visible);
    });

    const typed = links as Array<AuditedLink & { isButton: boolean; anchorMissing: boolean }>;
    const unnamed = typed.filter((l) => !l.name);
    const dead = typed.filter((l) => !l.isButton && (l.kind === 'empty' || l.kind === 'javascript' || l.href === '#'));
    const unsafeBlank = typed.filter((l) => l.target === '_blank' && l.kind === 'external' && !/noopener|noreferrer/i.test(l.rel));
    const malformedContact = typed.filter((l) => {
      if (l.kind === 'mailto') return !EMAIL.test(decodeURIComponent(l.href.slice(7).split('?')[0]));
      if (l.kind === 'tel') return l.href.replace(/\D/g, '').length < 7;
      return false;
    });
    const missingAnchors = typed.filter((l) => l.anchorMissing);

    // Actionability without clicking: visible, stable, enabled and not covered by another element.
    const notClickable: LinkAudit['notClickable'] = [];
    const candidates = typed.filter((l) => !['empty', 'javascript'].includes(l.kind)).slice(0, clickSample);
    for (const link of candidates) {
      const el = page.locator(`[data-pw-link="${link.index}"]`);
      try {
        // trial: runs every actionability check (and Playwright's own scroll-into-view retries) without clicking.
        await el.click({ trial: true, timeout: 5_000 });
      } catch (e) {
        notClickable.push({ ...link, reason: (e as Error).message.split('\n').find((line) => /intercepts|not visible|not stable|disabled|outside/i.test(line))?.trim() ?? 'not actionable' });
      }
    }

    let broken: UrlCheck[] = [];
    if (checkHttp) {
      const urls = typed.filter((l) => l.kind === 'internal' || (checkExternal && l.kind === 'external')).map((l) => l.url);
      broken = await brokenUrls(request, urls);
    }

    const audit: LinkAudit = { page: page.url(), links: typed, unnamed, dead, notClickable, broken, unsafeBlank, malformedContact, missingAnchors };
    await test.info().attach(`link audit ${new URL(page.url()).pathname}`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' });
    return audit;
  });
}

/** Short, readable list for assertion messages: "Contact (/contact) [footer]". */
export function describeLinks(links: Array<Pick<AuditedLink, 'name' | 'href' | 'area'>>): string[] {
  return links.map((l) => `${l.name || '<no name>'} (${l.href || '<empty href>'}) [${l.area}]`);
}
