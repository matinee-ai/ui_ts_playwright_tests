import { expect, test } from '../../../src/fixtures.ts';
import type { Position } from '../../../src/helpers/chess-board.ts';
import { ChessorroApp } from '../../../src/pages/chessorro.ts';

const count = (position: Position, code: string) => Object.values(position).filter((p) => p === code).length;

test.describe('Chessorro: daily puzzles', () => {
  test('a puzzle shows a valid chess position', async ({ page }) => {
    const board = await new ChessorroApp(page).openPuzzles();
    await expect.poll(() => board.pieceCount(), { message: 'puzzle pieces on the board' }).toBeGreaterThanOrEqual(3);

    const position = await board.position();
    expect(Object.keys(position).length).toBeLessThanOrEqual(32);
    expect(count(position, 'wk'), 'exactly one white king').toBe(1);
    expect(count(position, 'bk'), 'exactly one black king').toBe(1);
    const pawnOnBackRank = Object.entries(position).filter(([sq, p]) => p.endsWith('p') && /[18]$/.test(sq));
    expect(pawnOnBackRank, 'pawns can never stand on the first or last rank').toEqual([]);
  });

  test('"next puzzle" loads a different position', async ({ page }) => {
    const app = new ChessorroApp(page);
    const board = await app.openPuzzles();
    await expect.poll(() => board.pieceCount()).toBeGreaterThanOrEqual(3);
    const first = await board.signature();

    await app.nextPuzzleButton().click();
    await expect.poll(() => board.signature(), { message: 'board position after "next puzzle"', timeout: 20_000 }).not.toBe(first);
  });

  test('changing the difficulty filter loads a matching puzzle', async ({ page }) => {
    const app = new ChessorroApp(page);
    const board = await app.openPuzzles();
    await expect.poll(() => board.pieceCount()).toBeGreaterThanOrEqual(3);
    const first = await board.signature();

    const difficulty = /easy|medium|hard|beginner|intermediate|advanced|expert|difficulty|level|rating/i;
    const select = page.locator('select').filter({ hasText: difficulty }).filter({ visible: true }).first();
    if (await select.count()) {
      const options = await select.locator('option').evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value));
      const current = await select.inputValue();
      await select.selectOption(options.find((v) => v && v !== current)!);
    } else {
      const choice = page
        .getByRole('button', { name: difficulty })
        .or(page.getByRole('radio', { name: difficulty }))
        .or(page.getByRole('tab', { name: difficulty }))
        .filter({ visible: true });
      await expect(choice.first(), 'difficulty filter control').toBeVisible();
      // Pick an option that is not the currently selected one.
      const n = await choice.count();
      let clicked = false;
      for (let i = 0; i < n && !clicked; i++) {
        const option = choice.nth(i);
        const selected = (await option.getAttribute('aria-pressed')) === 'true' || (await option.getAttribute('aria-selected')) === 'true' || (await option.getAttribute('aria-checked')) === 'true';
        if (!selected) {
          await option.click();
          clicked = true;
        }
      }
      expect(clicked, 'a difficulty different from the current one').toBe(true);
    }
    await expect.poll(() => board.signature(), { message: 'board position after changing difficulty', timeout: 20_000 }).not.toBe(first);
  });
});
