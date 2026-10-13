import { expect, test } from '../../../src/fixtures.ts';
import { ChessBoard } from '../../../src/helpers/chess-board.ts';
import { ChessorroApp } from '../../../src/pages/chessorro.ts';

test.describe('Chessorro: openings', () => {
  test('autoplaying an opening plays its moves on the board', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openOpenings();

    // Choose an opening if the page starts with a list rather than a board.
    const opening = app.firstOpening();
    if (await opening.isVisible().catch(() => false)) await opening.click();
    const board = await ChessBoard.find(page);
    await expect.poll(() => board.pieceCount()).toBeGreaterThan(0);
    const before = await board.signature();

    await app.playButton().click();
    await expect
      .poll(() => board.signature(), { message: 'position changes while the opening autoplays', timeout: 20_000 })
      .not.toBe(before);

    // Moves keep coming: the position after a few seconds differs again.
    const midway = await board.signature();
    await expect.poll(() => board.signature(), { timeout: 20_000 }).not.toBe(midway);
  });
});
