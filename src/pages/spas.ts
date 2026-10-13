import type { Locator, Page } from '@playwright/test';
import { SITES } from '../../config/sites.ts';
import { SitePage } from '../helpers/site-page.ts';
import type { PageSpec } from '../suites/navigation.ts';

/** Russian (default) pages, from the live header menu. */
export const PAGES: PageSpec[] = [
  { name: 'О программе', path: '/about', heading: /Христианская онлайн-реабилитация/i, menu: /^О программе$/ },
  { name: 'Наставники', path: '/mentors', heading: /Люди, которые прошли этот путь/i, menu: /^Наставники$/ },
  { name: 'Участникам', path: '/for-participants', heading: /Если вы думаете о том, чтобы обратиться/i, menu: /^Участникам$/ },
  { name: 'Родственникам', path: '/for-family', heading: /Вы любите его/i, menu: /^Родственникам$/ },
  { name: 'FAQ', path: '/faq', heading: /Вопросы и ответы/i, menu: /^FAQ$/ },
  { name: 'Истории', path: '/stories', heading: /Истории восстановления/i, menu: /^Истории$/ },
  { name: 'Контакты', path: '/contact', heading: /Связаться с нами/i, menu: /^Контакты$/ },
  { name: 'Православие', path: '/orthodoxy', heading: /^Православие$/i, menu: /^Православие$/ },
  { name: 'Календарь', path: '/orthodoxy/calendar', heading: /Сегодня в церковном календаре/i, menu: /^Календарь$/, menuParent: /^Православие$/ },
  { name: 'Иконы', path: '/orthodoxy/icons', heading: /^Иконы$/i, menu: /^Иконы$/, menuParent: /^Православие$/ },
  { name: 'Оставить заявку', path: '/register', heading: /Оставить заявку на участие/i, menu: /^Оставить заявку$/, area: 'footer' },
];

/** English menu: link text -> path. Headings are checked for language, not wording. */
export const EN_MENU = [
  { menu: 'About', path: '/en/about' },
  { menu: 'Mentors', path: '/en/mentors' },
  { menu: 'Participants', path: '/en/for-participants' },
  { menu: 'Family', path: '/en/for-family' },
  { menu: 'FAQ', path: '/en/faq' },
  { menu: 'Stories', path: '/en/stories' },
  { menu: 'Contact', path: '/en/contact' },
  { menu: 'Orthodoxy', path: '/en/orthodoxy' },
  { menu: 'Book a call', path: '/en/booking' },
];

export const ICONS_PATH = '/en/orthodoxy/icons';
/** An icon page that is indexed by search engines; it must stay published. */
export const KNOWN_ICON = { path: '/en/orthodoxy/icons/angel-with-golden-hair', title: 'The Angel with Golden Hair' };

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** "6 октября 2026" -> Date (UTC midnight); "23 сентября" with a fallback year. */
export function parseRussianDate(text: string, fallbackYear?: number): Date | null {
  const m = /(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?/i.exec(text);
  if (!m) return null;
  const month = RU_MONTHS.indexOf(m[2].toLowerCase());
  const year = m[3] ? Number(m[3]) : fallbackYear;
  if (month < 0 || !year) return null;
  return new Date(Date.UTC(year, month, Number(m[1])));
}

export class SpasSite extends SitePage {
  constructor(page: Page) {
    super(page, SITES.spas);
  }

  /** The request form on /register (or /en/register). */
  requestForm(): Locator {
    return this.page.getByRole('main').locator('form').first();
  }

  /** The "today" block of the church calendar. */
  calendarDay(): Locator {
    return this.page.getByRole('main').getByRole('region').filter({ has: this.page.getByRole('heading', { level: 2 }) }).first();
  }
}
