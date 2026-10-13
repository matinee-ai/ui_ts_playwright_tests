import type { Locator, Page } from '@playwright/test';
import { SITES } from '../../config/sites.ts';
import { SitePage } from '../helpers/site-page.ts';
import type { PageSpec } from '../suites/navigation.ts';

/** Main pages, from the live site's header and footer menus. */
export const PAGES: PageSpec[] = [
  { name: 'Play now', path: '/en/play/chess', heading: /^Chess vs computer$/i, title: /Chess vs computer · Chessorro/, menu: /^Play now$/ },
  { name: 'History', path: '/en/history', heading: /^History of the games$/i, title: /History of the games · Chessorro/, menu: /^History$/ },
  { name: 'Ratings', path: '/en/ratings', heading: /^How ratings work$/i, title: /How ratings work · Chessorro/, menu: /^Ratings$/ },
  { name: 'Sign in', path: '/en/login', heading: /^Sign in$/i, headingLevel: 3, title: /Sign in · Chessorro/, menu: /^Sign in$/ },
  { name: 'Start a game', path: '/en/signup', heading: /^Create your account$/i, headingLevel: 3, title: /Create account · Chessorro/, menu: /^Start a game$/ },
  { name: 'Contact', path: '/en/contact', heading: /^Contact us$/i, title: /Contact us · Chessorro/, menu: /^Contact$/, area: 'footer' },
  { name: 'Terms', path: '/en/terms', heading: /^Terms of Service$/i, title: /Terms of Service · Chessorro/, menu: /^Terms$/, area: 'footer' },
  { name: 'Privacy', path: '/en/privacy', heading: /^Privacy Policy$/i, title: /Privacy Policy · Chessorro/, menu: /^Privacy$/, area: 'footer' },
  { name: 'Checkers', path: '/en/play/checkers', heading: /^Checkers vs computer$/i, title: /Checkers vs computer/ },
  { name: 'Backgammon', path: '/en/play/backgammon', heading: /^Backgammon vs computer$/i, title: /Backgammon vs computer/ },
  { name: 'Dominoes', path: '/en/play/dominoes', heading: /^Dominoes vs computer$/i, title: /Dominoes vs computer/ },
  { name: 'Reset password', path: '/en/forgot-password', heading: /^Reset your password$/i, headingLevel: 3, title: /Reset password · Chessorro/ },
];

export const GAMES = ['Chess', 'Checkers', 'Backgammon', 'Dominoes'] as const;
export type Game = (typeof GAMES)[number];

/** Setup options as published on /en/play/chess, with the defaults that are pre-selected. */
export const CHESS_SETUP: Record<string, { options: string[]; default: string }> = {
  Difficulty: { options: ['Beginner', 'Standard', 'Advanced'], default: 'Standard' },
  'You play': { options: ['White', 'Black', 'Random'], default: 'White' },
  'Match length': { options: ['Single game', 'First to 3', 'First to 5'], default: 'Single game' },
  'Computer speed': { options: ['Instant', 'Normal', 'Relaxed'], default: 'Normal' },
  Clock: { options: ['No clock', 'Bullet 1+0', 'Blitz 3+2', 'Blitz 5+0', 'Rapid 10+5'], default: 'No clock' },
  'Board style': { options: ['Royal Ivory', 'Walnut', 'Emerald Club', 'Midnight', 'Crimson Noir', 'Tournament Blue'], default: 'Royal Ivory' },
};

export class ChessorroApp extends SitePage {
  constructor(page: Page) {
    super(page, SITES.chessorro);
  }

  /** "Four games" card on the landing page. */
  gameCard(game: Game): Locator {
    return this.page.getByRole('article').filter({ has: this.page.getByRole('heading', { level: 3, name: game, exact: true }) });
  }

  async openGameSetup(game: Game = 'Chess'): Promise<void> {
    await this.open(`/en/play/${game.toLowerCase()}`);
  }

  /** A setup option group ("Difficulty", "You play", ...). */
  optionGroup(name: string): Locator {
    return this.page.getByRole('radiogroup', { name, exact: true });
  }

  option(group: string, option: string): Locator {
    return this.optionGroup(group).getByRole('radio', { name: option, exact: true });
  }

  /** Helper text under a setup group ("You play White and move first."). */
  optionHint(group: string): Locator {
    return this.page.getByRole('group', { name: group, exact: true }).getByRole('paragraph').last();
  }

  startButton(): Locator {
    return this.page.getByRole('button', { name: 'Start game', exact: true });
  }

  themeToggle(): Locator {
    return this.page.getByRole('button', { name: /switch to (dark|light) theme/i });
  }

  languageButton(): Locator {
    return this.page.getByRole('button', { name: 'Choose a language' });
  }
}
