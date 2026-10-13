import { expect, test } from '../../../src/fixtures.ts';
import { START_POSITION, signature, type ChessBoard } from '../../../src/helpers/chess-board.ts';
import { ChessorroApp } from '../../../src/pages/chessorro.ts';

test.describe('Chessorro: offline board', { tag: '@critical' }, () => {
  let board: ChessBoard;

  test.beforeEach(async ({ page }) => {
    board = await new ChessorroApp(page).openOfflineBoard();
    await expect.poll(() => board.pieceCount(), { message: 'pieces readable on the board' }).toBe(32);
  });

  test('a new game starts from the initial position', async () => {
    expect(signature(await board.position())).toBe(signature(START_POSITION));
  });

  test('legal moves are played for both sides in turn', async () => {
    await board.move('e2', 'e4');
    await expect.poll(() => board.pieceAt('e4')).toBe('wp');
    expect(await board.pieceAt('e2')).toBeNull();

    await board.move('e7', 'e5');
    await expect.poll(() => board.pieceAt('e5')).toBe('bp');
    expect(await board.pieceAt('e7')).toBeNull();

    await board.move('g1', 'f3');
    await expect.poll(() => board.pieceAt('f3')).toBe('wn');
    expect(await board.pieceCount()).toBe(32);
  });

  test('a capture removes the captured piece', async () => {
    await board.move('e2', 'e4');
    await expect.poll(() => board.pieceAt('e4')).toBe('wp');
    await board.move('d7', 'd5');
    await expect.poll(() => board.pieceAt('d5')).toBe('bp');

    await board.move('e4', 'd5');
    await expect.poll(() => board.pieceAt('d5')).toBe('wp');
    expect(await board.pieceCount()).toBe(31);
  });

  test('illegal moves and moves out of turn are rejected', async ({ page }) => {
    const start = await board.signature();

    await board.move('e2', 'e5'); // pawn cannot advance three squares
    await page.waitForTimeout(500);
    expect(await board.signature(), 'pawn e2-e5 must be rejected').toBe(start);

    await board.move('e7', 'e5'); // black cannot move first
    await page.waitForTimeout(500);
    expect(await board.signature(), 'black moving first must be rejected').toBe(start);

    await board.move('e1', 'e3'); // king cannot jump over its own pawn
    await page.waitForTimeout(500);
    expect(await board.signature(), 'king e1-e3 must be rejected').toBe(start);
  });
});
