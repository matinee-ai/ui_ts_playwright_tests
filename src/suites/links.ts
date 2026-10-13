import type { SiteConfig } from '../../config/sites.ts';
import { expect, test } from '../fixtures.ts';
import { auditLinks, describeLinks, type LinkAudit } from '../helpers/link-audit.ts';
import { SitePage } from '../helpers/site-page.ts';
import type { PageSpec } from './navigation.ts';

/**
 * Registers one link-validation test per page: every visible link has a name,
 * goes somewhere real, can actually be clicked (not hidden under another
 * element), and leads to a live page. Plus a site-wide check that links opening
 * a new tab are protected with rel="noopener".
 */
export function linkTests(site: SiteConfig, pages: PageSpec[]): void {
  test.describe(`${site.name}: links`, () => {
    test.describe.configure({ timeout: 180_000 });

    for (const [i, spec] of pages.entries()) {
      // Header and footer are shared by every page: audit them once (first page), page content everywhere.
      const scope = i === 0 ? 'page, header and footer' : 'page content';
      test(`links on ${spec.name} (${scope}) are named, clickable and live`, async ({ page }) => {
        await new SitePage(page, site).open(spec.path);
        const audit = await auditLinks(page, page.request, i === 0 ? {} : { areas: ['main'] });

        if (i === 0) expect(audit.links.length, 'visible links on the page').toBeGreaterThan(0);
        expect.soft(describeLinks(audit.unnamed), 'links without an accessible name (screen readers announce just "link")').toEqual([]);
        expect.soft(describeLinks(audit.dead), 'links that go nowhere (href "", "#" or javascript:)').toEqual([]);
        expect.soft(audit.notClickable.map((l) => `${describeLinks([l])[0]}: ${l.reason}`), 'links a user cannot click').toEqual([]);
        expect.soft(audit.broken.map((b) => `${b.status || b.error} ${b.url}`), 'links to pages that fail').toEqual([]);
        expect.soft(describeLinks(audit.malformedContact), 'mailto:/tel: links with an invalid address').toEqual([]);
        expect.soft(describeLinks(audit.missingAnchors), 'in-page links to sections that do not exist').toEqual([]);
      });
    }

    test('links that open a new tab use rel="noopener"', { tag: '@minor' }, async ({ page }) => {
      const sitePage = new SitePage(page, site);
      const findings: string[] = [];
      for (const spec of pages.slice(0, 4)) {
        await sitePage.open(spec.path);
        const audit: LinkAudit = await auditLinks(page, page.request, { checkHttp: false, clickSample: 0 });
        findings.push(...describeLinks(audit.unsafeBlank).map((l) => `${spec.name}: ${l}`));
      }
      expect([...new Set(findings)], 'target="_blank" links without rel="noopener"').toEqual([]);
    });
  });
}
