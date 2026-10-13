import type { Locator, Page } from '@playwright/test';
import { SITES } from '../../config/sites.ts';
import { SitePage } from '../helpers/site-page.ts';
import type { PageSpec } from '../suites/navigation.ts';

/** The learning path, in order, with the slug of each course page. */
export const COURSES = [
  { name: 'QA BASIC', slug: 'qa-basic' },
  { name: 'QA ADVANCE', slug: 'qa-advance' },
  { name: 'QA AUTOMATION', slug: 'qa-automation' },
  { name: 'AI AUTOMATION', slug: 'ai-automation' },
  { name: 'n8n AUTOMATION', slug: 'n8n-automation' },
] as const;
export const COURSE_TRACKS = COURSES.map((c) => c.name);
/** "Complete QA path" bundle: these three on the Unlimited plan. */
export const CORE_BUNDLE = ['QA BASIC', 'QA ADVANCE', 'QA AUTOMATION'];

export const PAGES: PageSpec[] = [
  { name: 'Career Services', path: '/career-services', heading: /^Career Services$/i, title: /Career Services/, menu: /^Career Services$/ },
  { name: 'IT English', path: '/it-english', heading: /Learn IT English in 5 Minutes a Day/i, title: /IT English/, menu: /^IT English$/ },
  { name: 'Enroll', path: '/checkout', heading: /^Build your course package$/i, menu: /^Enroll$/ },
  ...COURSES.map((c) => ({ name: c.name, path: `/courses/${c.slug}`, heading: new RegExp(`^${c.name}$`, 'i'), title: new RegExp(`^${c.name} — .*QAstarting`) })),
  { name: 'Blog: QA salaries', path: '/blog/skolko-zarabatyvaet-testirovshchik', heading: /How much does a QA tester really earn/i, title: /QAstarting/ },
];

/** Single-page sections reached from the top menu (link text -> element id). */
export const SECTIONS = [
  { menu: 'Quiz', id: 'quiz' },
  { menu: 'Courses', id: 'courses' },
  { menu: 'Pricing', id: 'pricing' },
  { menu: 'Stories', id: 'stories' },
  { menu: 'FAQ', id: 'faq' },
  { menu: 'Team', id: 'team' },
  { menu: 'Contact', id: 'contact' },
  { menu: 'Free lessons', id: 'free' },
];

export type Plan = 'starter' | 'standard' | 'unlimited';
export interface CoursePrices {
  course: string;
  prices: Partial<Record<Plan, number>>;
}

const money = (text: string) => Number(text.replace(/[^\d]/g, ''));

/** "Starter Self-paced... $259 Standard Guided... $499 Unlimited Maximum... $999" -> { starter: 259, ... } */
export function parsePlanPrices(cardText: string): Partial<Record<Plan, number>> {
  const prices: Partial<Record<Plan, number>> = {};
  for (const m of cardText.matchAll(/\b(starter|standard|unlimited)\b[^$]*?\$\s?([\d,]+)/gi)) {
    prices[m[1].toLowerCase() as Plan] ??= money(m[2]);
  }
  return prices;
}

/** "$3,317 $2,653 Save $664 (~20%)" -> { regular, discounted, saving, percent } */
export function parseBundleOffer(text: string): { regular: number; discounted: number; saving: number; percent: number } | null {
  const m = /\$\s?([\d,]+)\s*\$\s?([\d,]+)\s*Save\s*\$\s?([\d,]+)\s*\(~?(\d+)%\)/i.exec(text);
  return m ? { regular: money(m[1]), discounted: money(m[2]), saving: money(m[3]), percent: Number(m[4]) } : null;
}

export class QaStartingSite extends SitePage {
  constructor(page: Page) {
    super(page, SITES.qastarting);
  }

  /** A home-page section by its anchor id ("pricing", "faq", ...). */
  byId(id: string): Locator {
    return this.page.locator(`[id="${id}"]`);
  }

  /** Plan prices from each course card in the pricing section. */
  async pricingCards(): Promise<CoursePrices[]> {
    const cards = await this.byId('pricing').evaluate((section) =>
      [...section.querySelectorAll('h3')].map((h) => {
        let card: Element | null = h.parentElement;
        const prices = (el: Element) => (el.textContent ?? '').match(/\$\s?[\d,]+/g)?.length ?? 0;
        while (card && card !== section && prices(card) < 3) card = card.parentElement;
        return { course: (h.textContent ?? '').trim(), text: card && card !== section ? (card as HTMLElement).innerText : '' };
      }),
    );
    return cards
      .filter((c) => c.text && (COURSE_TRACKS as readonly string[]).includes(c.course))
      .map((c) => ({ course: c.course, prices: parsePlanPrices(c.text) }));
  }

  /** Rows of the comparison table: course -> { starter, unlimited }. */
  async pricingTable(): Promise<CoursePrices[]> {
    const rows = this.byId('pricing').getByRole('table').getByRole('row');
    const out: CoursePrices[] = [];
    for (const row of await rows.all()) {
      const cells = await row.getByRole('cell').allInnerTexts();
      if (cells.length < 5 || !/\$/.test(cells[3])) continue;
      out.push({ course: cells[0].trim(), prices: { starter: money(cells[3]), unlimited: money(cells[4]) } });
    }
    return out;
  }

  /** A course card on /checkout. */
  checkoutCourse(name: string): Locator {
    return this.page
      .getByRole('heading', { name, exact: true })
      .locator('xpath=ancestor::*[.//button][1]');
  }

  /** "Your order" panel on /checkout. */
  orderPanel(): Locator {
    return this.page.getByRole('heading', { name: 'Your order' }).locator('xpath=ancestor::*[.//button][1]');
  }

  /** The order's submit button ("Pay online", "Continue to crypto payment", ...): the panel's last button. */
  payButton(): Locator {
    return this.orderPanel().getByRole('button').last();
  }

  /** Plan buttons of a selected course on /checkout ("Starter $259 ..."). */
  planButton(course: string, plan: 'Starter' | 'Standard' | 'Unlimited'): Locator {
    // A selected course card holds its "✓ Selected" toggle plus the three plan buttons.
    return this.page
      .getByRole('heading', { name: course, exact: true })
      .locator('xpath=ancestor::*[count(.//button) >= 4][1]')
      .getByRole('button', { name: new RegExp(`^${plan} \\$`) });
  }

  /** Total shown in the order panel, in dollars. */
  async orderTotal(): Promise<number> {
    const text = await this.orderPanel().innerText();
    const m = /Total\s*\$\s?([\d,]+)/i.exec(text);
    if (!m) throw new Error(`No "Total $..." in the order panel: ${text.slice(0, 200)}`);
    return money(m[1]);
  }

  loginLink(): Locator {
    return this.page.getByRole('navigation').first().getByRole('link', { name: 'Login', exact: true });
  }
}
