import { expect, test } from '../../../src/fixtures.ts';
import { ChessBoard, START_POSITION, signature } from '../../../src/helpers/chess-board.ts';
import { CHESS_SETUP, ChessorroApp } from '../../../src/pages/chessorro.ts';

test.describe('Chessorro: game against the computer', () => {
  test('setup shows every option group with its default selected', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openGameSetup('Chess');
    for (const [group, { options, default: selected }] of Object.entries(CHESS_SETUP)) {
      await test.step(group, async () => {
        for (const option of options) await expect(app.option(group, option), `${group}: ${option}`).toBeVisible();
        await expect(app.option(group, selected), `${group} default`).toBeChecked();
        await expect(app.optionGroup(group).getByRole('radio', { checked: true }), `one ${group} selected`).toHaveCount(1);
      });
    }
  });

  test('choosing an option selects it, clears the previous one and updates its description', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openGameSetup('Chess');
    for (const [group, option, previous] of [['You play', 'Black', 'White'], ['Difficulty', 'Advanced', 'Standard'], ['Clock', 'Blitz 3+2', 'No clock']]) {
      await test.step(`${group}: ${option}`, async () => {
        const hint = await app.optionHint(group).innerText();
        await app.option(group, option).click();
        await expect(app.option(group, option)).toBeChecked();
        await expect(app.option(group, previous)).not.toBeChecked();
        await expect(app.optionHint(group), 'description follows the choice').not.toHaveText(hint);
      });
    }
  });

  test('options are keyboard accessible', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openGameSetup('Chess');
    await app.option('Difficulty', 'Standard').focus();
    await page.keyboard.press('ArrowRight');
    await expect(app.option('Difficulty', 'Advanced'), 'arrow key moves the selection').toBeChecked();
  });

  test('dominoes lets you lead or follow instead of picking a colour', async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openGameSetup('Dominoes');
    for (const option of ['Lead', 'Follow', 'Random']) await expect(app.option('You play', option)).toBeVisible();
    await expect(app.option('You play', 'White')).toHaveCount(0);
  });

  test('a chess game starts from the initial position with White to move', { tag: '@critical' }, async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openGameSetup('Chess');
    await app.option('Computer speed', 'Instant').click();
    await app.startButton().click();

    const board = await ChessBoard.find(page);
    await expect.poll(() => board.pieceCount(), { message: 'pieces on the board' }).toBe(32);
    expect(signature(await board.position())).toBe(signature(START_POSITION));
  });

  test('the computer answers a legal move and refuses an illegal one', { tag: '@critical' }, async ({ page }) => {
    const app = new ChessorroApp(page);
    await app.openGameSetup('Chess');
    await app.option('Computer speed', 'Instant').click();
    await app.startButton().click();
    const board = await ChessBoard.find(page);
    await expect.poll(() => board.pieceCount()).toBe(32);

    const start = await board.signature();
    await board.move('e2', 'e5'); // a pawn cannot advance three squares
    await page.waitForTimeout(800);
    expect(await board.signature(), 'illegal move refused').toBe(start);

    await board.move('e2', 'e4');
    await expect.poll(() => board.pieceAt('e4'), { message: 'pawn on e4' }).toBe('wp');
    const blackBefore = Object.entries(await board.position()).filter(([, p]) => p.startsWith('b')).map(([sq]) => sq).sort().join();
    await expect
      .poll(async () => Object.entries(await board.position()).filter(([, p]) => p.startsWith('b')).map(([sq]) => sq).sort().join(), {
        message: 'computer moved a black piece',
        timeout: 20_000,
      })
      .not.toBe(blackBefore);
  });
});
