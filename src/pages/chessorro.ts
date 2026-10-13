import type { Locator, Page } from '@playwright/test';
import { SITES } from '../../config/sites.ts';
import { ChessBoard } from '../helpers/chess-board.ts';
import { SitePage } from '../helpers/site-page.ts';

/** Features advertised on the landing page ("Play & Learn for Free"). */
export const CORE_FEATURES: Array<{ name: string; heading: RegExp; link: RegExp; paths: string[] }> = [
  {
    name: 'Autoplay openings',
    heading: /autoplay openings/i,
    link: /autoplay|openings|saved games/i,
    paths: ['/en/openings', '/en/saved-games', '/en/autoplay'],
  },
  { name: 'Practice openings', heading: /practice openings/i, link: /practice/i, paths: ['/en/practice', '/en/openings/practice'] },
  { name: 'Daily puzzles', heading: /puzzles/i, link: /puzzle/i, paths: ['/en/puzzles', '/en/puzzle', '/en/daily-puzzles'] },
  { name: 'Live games', heading: /live games/i, link: /live|play (with )?friends?|invite/i, paths: ['/en/live', '/en/play'] },
  { name: 'Offline board', heading: /offline board/i, link: /offline|face.to.face/i, paths: ['/en/offline', '/en/board', '/en/offline-board'] },
];

const feature = (name: string) => CORE_FEATURES.find((f) => f.name === name)!;

export class ChessorroApp extends SitePage {
  constructor(page: Page) {
    super(page, SITES.chessorro);
  }

  async openFeature(name: string): Promise<ChessBoard> {
    const f = feature(name);
    await this.open();
    await this.openSection(f.link, f.paths);
    return ChessBoard.find(this.page);
  }

  openOfflineBoard(): Promise<ChessBoard> {
    return this.openFeature('Offline board');
  }

  openPuzzles(): Promise<ChessBoard> {
    return this.openFeature('Daily puzzles');
  }

  openOpenings(): Promise<ChessBoard> {
    return this.openFeature('Autoplay openings');
  }

  /** "Next puzzle" / "New puzzle" / "Skip" control. */
  nextPuzzleButton(): Locator {
    return this.page
      .getByRole('button', { name: /next|new puzzle|another|skip|следующ|новая/i })
      .or(this.page.getByRole('link', { name: /next puzzle|new puzzle/i }))
      .filter({ visible: true })
      .first();
  }

  /** Play / autoplay control of the openings viewer. */
  playButton(): Locator {
    return this.page
      .getByRole('button', { name: /^(▶|►)?\s*(play|autoplay|start|watch|воспроизвести|играть)\b/i })
      .or(this.page.locator('button[aria-label*="play" i], button[title*="play" i], [class*="play" i] button, button[class*="play" i]'))
      .filter({ visible: true })
      .first();
  }

  /** First opening in the list of openings / saved games. */
  firstOpening(): Locator {
    return this.page
      .locator('main, [role="main"], body')
      .first()
      .locator('a[href*="opening" i], a[href*="game" i], [role="listitem"], li button, [class*="opening" i] a, [class*="opening" i][role="button"]')
      .filter({ visible: true })
      .first();
  }
}
