import type { Locator, Page } from '@playwright/test';
import { SITES } from '../../config/sites.ts';
import { FormHelper } from '../helpers/forms.ts';
import { SitePage } from '../helpers/site-page.ts';

/** Learning path published on the courses page. */
export const COURSE_TRACKS = ['QA BASIC', 'QA ADVANCE', 'QA AUTOMATION', 'AI AUTOMATION', 'n8n AUTOMATION'];

export interface PricePlan {
  plan: 'starter' | 'standard' | 'ultimate';
  price: number;
}

/**
 * Reads "Starter Plan – $259  Standart Plan – $499  Ultimate Plan – $999" blocks
 * from page text and groups them per course (one Starter..Ultimate run per course).
 */
export function parsePricePlans(text: string): PricePlan[][] {
  const re = /(starter|standa\w*|ultimate)\s+plan\s*[–—-]?\s*\$\s*([\d,]+)/gi;
  const courses: PricePlan[][] = [];
  for (const m of text.matchAll(re)) {
    const plan = m[1].toLowerCase().startsWith('standa') ? 'standard' : (m[1].toLowerCase() as PricePlan['plan']);
    const price = Number(m[2].replace(/,/g, ''));
    if (plan === 'starter' || !courses.length) courses.push([]);
    courses[courses.length - 1].push({ plan, price });
  }
  return courses;
}

/** "3 ULTIMATE COURSES $ 3317 ONLY FOR $ 2599" -> { regular: 3317, discounted: 2599 } */
export function parseBundle(text: string): { regular: number; discounted: number } | null {
  const m = /ultimate courses\s*\$\s*([\d,]+)\s*only for\s*\$\s*([\d,]+)/i.exec(text);
  return m ? { regular: Number(m[1].replace(/,/g, '')), discounted: Number(m[2].replace(/,/g, '')) } : null;
}

export class QaStartingSite extends SitePage {
  constructor(page: Page) {
    super(page, SITES.qastarting);
  }

  async openCourses(): Promise<void> {
    await this.open();
    await this.openSection(/^(all )?courses$|курсы|our courses/i, ['/courses', '/en/courses']);
  }

  /** Card / block of a course on the courses page. */
  courseCard(track: string): Locator {
    return this.page.getByText(new RegExp(`^\\s*${track}\\s*$`, 'i')).filter({ visible: true }).first();
  }

  /** Opens a course's enrolment page from the catalogue and returns its form. */
  async openEnrolment(track = 'QA BASIC'): Promise<FormHelper> {
    await this.openCourses();
    const card = this.courseCard(track);
    // The card title, its "Details" button or the whole card may be the link.
    const link = this.page
      .locator('a', { has: card })
      .or(card.locator('xpath=ancestor-or-self::a[1]'))
      .or(card.locator('xpath=ancestor::*[.//a][1]').getByRole('link', { name: /details|enrol|enroll|learn more|more|подробнее|записаться/i }))
      .first();
    await link.click();
    await this.page.waitForLoadState('domcontentloaded');
    return FormHelper.find(this.page);
  }

  /** Expandable FAQ question (accordion trigger or <summary>). */
  faqQuestions(): Locator {
    return this.page
      .locator('[aria-expanded="false"], details:not([open]) > summary')
      .filter({ hasText: /\?/ })
      .filter({ visible: true });
  }
}
