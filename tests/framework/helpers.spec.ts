/**
 * Offline checks of the page helpers against local fixture pages, so a broken
 * helper shows up here instead of as a mysterious failure on a live site.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from '../../src/fixtures.ts';
import { ChessBoard, START_POSITION, signature } from '../../src/helpers/chess-board.ts';
import { FormHelper } from '../../src/helpers/forms.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CHESSGROUND = path.resolve('node_modules/chessground');
const ORIGIN = 'https://fixtures.test';

/** Serves tests/framework/fixtures (and chessground from node_modules) at https://fixtures.test. */
async function serve(page: Page, file: string): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const { pathname } = new URL(route.request().url());
    const name = path.basename(pathname);
    const local = pathname.startsWith('/vendor/')
      ? path.join(CHESSGROUND, name.endsWith('.js') ? 'dist' : 'assets', name)
      : path.join(FIXTURES, name);
    return route.fulfill({ path: local });
  });
  await page.goto(`${ORIGIN}/${file}`);
}

for (const orientation of ['white', 'black']) {
  test.describe(`ChessBoard on chessground (${orientation} at the bottom)`, () => {
    let board: ChessBoard;

    test.beforeEach(async ({ page }) => {
      await serve(page, `chessground.html?orientation=${orientation}`);
      board = await ChessBoard.find(page);
    });

    test('reads the start position', async () => {
      expect(signature(await board.position())).toBe(signature(START_POSITION));
    });

    test('plays legal moves and captures', async () => {
      await board.move('e2', 'e4');
      await expect.poll(() => board.pieceAt('e4')).toBe('wp');
      await board.move('d7', 'd5');
      await expect.poll(() => board.pieceAt('d5')).toBe('bp');
      await board.move('e4', 'd5');
      await expect.poll(() => board.pieceAt('d5')).toBe('wp');
      expect(await board.pieceAt('e4')).toBeNull();
      expect(await board.pieceCount()).toBe(31);
      await board.move('g8', 'f6');
      await expect.poll(() => board.pieceAt('f6')).toBe('bn');
    });

    test('leaves the position unchanged after illegal moves', async ({ page }) => {
      const start = await board.signature();
      for (const [from, to] of [['e2', 'e5'], ['e7', 'e5'], ['e1', 'e3']]) {
        await board.move(from, to);
        await page.waitForTimeout(300);
        expect(await board.signature(), `${from}-${to}`).toBe(start);
      }
    });
  });
}

test.describe('ChessBoard on a data-square grid (click-to-move only)', () => {
  test('falls back to clicking when dragging does nothing', async ({ page }) => {
    await serve(page, 'grid-board.html');
    const board = await ChessBoard.find(page);
    expect(signature(await board.position())).toBe(signature(START_POSITION));

    await board.move('e2', 'e4');
    await expect.poll(() => board.pieceAt('e4')).toBe('wp');
    await board.move('e7', 'e5');
    await expect.poll(() => board.pieceAt('e5')).toBe('bp');
    await board.move('e1', 'e3');
    await page.waitForTimeout(300);
    expect(await board.pieceAt('e1'), 'illegal king move rejected').toBe('wk');
  });

  test('reads a board flipped to black', async ({ page }) => {
    await serve(page, 'grid-board.html?orientation=black');
    const board = await ChessBoard.find(page);
    expect(signature(await board.position())).toBe(signature(START_POSITION));
    await board.move('g1', 'f3');
    await expect.poll(() => board.pieceAt('f3')).toBe('wn');
  });

  test('detects a new position after "next puzzle"', async ({ page }) => {
    await serve(page, 'grid-board.html?mode=puzzle');
    const board = await ChessBoard.find(page);
    expect(await board.pieceAt('e1')).toBe('wk');
    const first = await board.signature();
    await page.getByRole('button', { name: /next puzzle/i }).click();
    await expect.poll(() => board.signature()).not.toBe(first);
  });
});

test.describe('FormHelper + FormSpy', () => {
  test.beforeEach(async ({ page }) => {
    await serve(page, 'forms.html');
  });

  test('native-validation form: empty submit is blocked, complete submit is captured', async ({ page, formSpy }) => {
    const form = await FormHelper.find(page, page.locator('#native'));
    expect((await form.fields()).map((f) => f.kind)).toEqual(['name', 'email', 'phone', 'checkbox']);

    formSpy.arm();
    await form.submit();
    await formSpy.expectNoSubmission(1_000);
    expect(await form.validationErrors()).not.toEqual([]);

    await form.fill(formSpy.data);
    await expect(page.locator('#enrol input[name="consent"]')).toBeChecked();
    await form.submit();
    const sent = await formSpy.expectSubmission([formSpy.data.email, formSpy.data.name]);
    expect(sent.url).toBe('https://api.fixtures.test/leads');
    expect(JSON.parse(sent.body.split('\n')[0])).toMatchObject({ email: formSpy.data.email, phone: formSpy.data.phone, consent: 'on' });
  });

  test('Tilda-style form: JS errors are detected, urlencoded XHR is captured', async ({ page, formSpy }) => {
    const form = await FormHelper.find(page, page.locator('#tilda'));
    expect((await form.fields()).map((f) => f.kind)).toEqual(['phone', 'email']);

    formSpy.arm();
    await form.fill(formSpy.data, { email: 'not-an-email' });
    await form.submit();
    await formSpy.expectNoSubmission(1_000);
    expect(await form.validationErrors()).toContain('Please enter a valid email');

    await form.fill(formSpy.data);
    await form.submit();
    const sent = await formSpy.expectSubmission([formSpy.data.email]);
    expect(sent.url).toBe('https://forms.fixtures.test/procces/');
  });

  test('a form opened by a button is found instead of forms already on the page', async ({ page, formSpy }) => {
    await FormHelper.rememberVisibleForms(page);
    await page.getByRole('button', { name: 'Get help' }).click();
    const form = await FormHelper.find(page, undefined, { newOnly: true });
    await expect(form.root).toHaveAttribute('id', 'help-form');
    expect((await form.fields()).map((f) => f.kind)).toEqual(['name', 'phone', 'message']);

    await form.fill(formSpy.data);
    formSpy.arm();
    await form.submit();
    const sent = await formSpy.expectSubmission([formSpy.marker]);
    expect(sent.url).toBe(`${ORIGIN}/api/help`);
  });

  test('anti-spam honeypot fields are left empty', async ({ page }) => {
    await page.locator('#native form').evaluate((form) => {
      form.insertAdjacentHTML('afterbegin', '<input name="website" type="text" style="position:absolute;left:-9999px" tabindex="-1">');
    });
    const form = await FormHelper.find(page, page.locator('#native'));
    expect((await form.fields()).map((f) => f.kind)).toEqual(['name', 'email', 'phone', 'checkbox']);
  });
});
