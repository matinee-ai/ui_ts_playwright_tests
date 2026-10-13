import type { Locator, Page } from '@playwright/test';

/** e.g. "wp" = white pawn, "bk" = black king; "?" when the piece colour/type can't be read. */
export type PieceCode = string;
export type Position = Record<string, PieceCode>;

interface Geometry {
  left: number;
  top: number;
  size: number;
  flipped: boolean;
}

/**
 * Library-agnostic chess board driver. Finds the board on the page, reads the
 * position from the DOM and plays moves with the mouse, so the same tests work
 * whether the site renders with chessground (lichess), react-chessboard,
 * chessboard.js or a hand-made 8x8 grid.
 */
export class ChessBoard {
  readonly locator: Locator;

  private constructor(
    private readonly page: Page,
    private readonly id: string,
  ) {
    this.locator = page.locator(`[data-pw-board="${id}"]`);
  }

  /** Waits for a visible board and returns a driver for it. */
  static async find(page: Page, { timeout = 30_000 } = {}): Promise<ChessBoard> {
    const id = `b${Math.random().toString(36).slice(2, 8)}`;
    try {
      await page.waitForFunction(markBoard, id, { timeout, polling: 500 });
    } catch {
      throw new Error(`No chess board found on ${page.url()} within ${timeout}ms`);
    }
    return new ChessBoard(page, id);
  }

  /** Every piece currently on the board, keyed by square ("e4" -> "wp"). */
  async position(): Promise<Position> {
    return this.page.evaluate(readPosition, this.id);
  }

  async pieceAt(square: string): Promise<PieceCode | null> {
    return (await this.position())[square] ?? null;
  }

  async pieceCount(): Promise<number> {
    return Object.keys(await this.position()).length;
  }

  /** Comparable snapshot of the position, e.g. "a1:wr b1:wn ...". */
  async signature(): Promise<string> {
    return signature(await this.position());
  }

  /**
   * Plays a move by dragging the piece; if the board ignores drags, falls back
   * to click-from / click-to. Does not assert legality: check the position after.
   */
  async move(from: string, to: string): Promise<void> {
    const before = await this.position();
    const a = await this.squareCenter(from);
    const b = await this.squareCenter(to);

    await this.page.mouse.move(a.x, a.y);
    await this.page.mouse.down();
    await this.page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    await this.page.mouse.move(b.x, b.y, { steps: 5 });
    await this.page.mouse.up();
    if (await this.changedFrom(before, from)) return;

    await this.page.mouse.click(a.x, a.y);
    await this.page.mouse.click(b.x, b.y);
    await this.changedFrom(before, from);
  }

  /** Viewport coordinates of the centre of a square, honouring board orientation. */
  async squareCenter(square: string): Promise<{ x: number; y: number }> {
    const g = await this.page.evaluate(readGeometry, this.id);
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const col = g.flipped ? 7 - file : file;
    const row = g.flipped ? rank : 7 - rank;
    const cell = g.size / 8;
    return { x: g.left + (col + 0.5) * cell, y: g.top + (row + 0.5) * cell };
  }

  private async changedFrom(before: Position, from: string, timeout = 2_000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const now = await this.position();
      if (before[from] && !now[from]) return true;
      await this.page.waitForTimeout(150);
    }
    return false;
  }
}

export function signature(position: Position): string {
  return Object.entries(position)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sq, p]) => `${sq}:${p}`)
    .join(' ');
}

export const START_POSITION: Position = (() => {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const position: Position = {};
  'abcdefgh'.split('').forEach((f, i) => {
    position[`${f}1`] = `w${back[i]}`;
    position[`${f}2`] = 'wp';
    position[`${f}7`] = 'bp';
    position[`${f}8`] = `b${back[i]}`;
  });
  return position;
})();

// ---------------------------------------------------------------------------
// Functions below run inside the browser. They must be self-contained.
// ---------------------------------------------------------------------------

/** Finds the most likely board element and tags it with data-pw-board=id. */
function markBoard(id: string): boolean {
  const existing = document.querySelector(`[data-pw-board="${id}"]`);
  if (existing && existing.isConnected) return true;

  const isShown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width >= 120 && r.height >= 120 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const isSquarish = (el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.width - r.height) / Math.max(r.width, r.height) < 0.08;
  };

  let board: Element | null = null;

  // 1. Grids that label their squares (react-chessboard, chessboard.js, many custom boards).
  const labelled = [...document.querySelectorAll('[data-square]')].filter((s) =>
    /^[a-h][1-8]$/.test(s.getAttribute('data-square') ?? ''),
  );
  if (labelled.length >= 64) {
    let el: Element | null = labelled[0].parentElement;
    while (el && el.querySelectorAll('[data-square]').length < 64) el = el.parentElement;
    if (el && isShown(el)) board = el;
  }

  // 2. Well-known board containers.
  if (!board) {
    const selectors = [
      'cg-board',
      '[data-boardid]',
      '.board-b72b1',
      '.cm-chessboard',
      '[data-testid*="board" i]',
      '[class*="chessboard" i]',
      '[id*="chessboard" i]',
      '[class*="board" i]',
      '[id*="board" i]',
    ];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)]
        .filter((el) => isShown(el) && isSquarish(el))
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      if (found.length) {
        board = found[0];
        break;
      }
    }
  }

  // 3. Any element laid out as an 8x8 grid of children.
  if (!board) {
    board =
      [...document.querySelectorAll('div, section, table, tbody')].find((el) => {
        const kids = el.children;
        if (kids.length === 64) return isShown(el) && isSquarish(el);
        if (kids.length === 8 && [...kids].every((row) => row.children.length === 8)) return isShown(el) && isSquarish(el);
        return false;
      }) ?? null;
  }

  if (!board) return false;
  document.querySelectorAll('[data-pw-board]').forEach((el) => el.removeAttribute('data-pw-board'));
  board.setAttribute('data-pw-board', id);
  return true;
}

function readGeometry(id: string): Geometry {
  const board = document.querySelector(`[data-pw-board="${id}"]`);
  if (!board) throw new Error('Chess board is no longer on the page');

  // Prefer the union of labelled squares: it excludes borders and coordinates.
  const squares = [...board.querySelectorAll('[data-square]')].filter((s) =>
    /^[a-h][1-8]$/.test(s.getAttribute('data-square') ?? ''),
  );
  let rect = board.getBoundingClientRect();
  let flipped = false;
  if (squares.length >= 64) {
    const rects = squares.map((s) => s.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    rect = new DOMRect(left, top, right - left, bottom - top);
    const a1 = board.querySelector('[data-square="a1"]')!.getBoundingClientRect();
    flipped = a1.top < rect.top + rect.height / 2;
  } else {
    const wrap = board.closest('.cg-wrap');
    if (wrap) flipped = wrap.classList.contains('orientation-black');
    else if (board.closest('[class*="flipped" i], [class*="orientation-black" i], [data-orientation="black"]')) flipped = true;
  }
  return { left: rect.left, top: rect.top, size: Math.min(rect.width, rect.height), flipped };
}

function readPosition(id: string): Record<string, string> {
  const board = document.querySelector(`[data-pw-board="${id}"]`);
  if (!board) throw new Error('Chess board is no longer on the page');

  // Geometry (duplicated from readGeometry: browser functions can't share code).
  const labelled = [...board.querySelectorAll('[data-square]')].filter((s) =>
    /^[a-h][1-8]$/.test(s.getAttribute('data-square') ?? ''),
  );
  let rect = board.getBoundingClientRect();
  let flipped = false;
  if (labelled.length >= 64) {
    const rects = labelled.map((s) => s.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    rect = new DOMRect(left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top);
    flipped = board.querySelector('[data-square="a1"]')!.getBoundingClientRect().top < rect.top + rect.height / 2;
  } else {
    const wrap = board.closest('.cg-wrap');
    if (wrap) flipped = wrap.classList.contains('orientation-black');
    else if (board.closest('[class*="flipped" i], [class*="orientation-black" i], [data-orientation="black"]')) flipped = true;
  }
  const cell = Math.min(rect.width, rect.height) / 8;

  const TYPES: Record<string, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
  const identify = (el: Element): string | null => {
    const text = ['data-piece', 'class', 'alt', 'src', 'href', 'xlink:href', 'aria-label', 'title', 'data-testid']
      .map((a) => el.getAttribute(a) ?? '')
      .join(' ');
    if (/\b(ghost|fading|dragging|spare)\b/i.test(el.getAttribute('class') ?? '')) return null;
    const code = /(?:^|[^a-z0-9])([wb])([pnbrqk])(?:[^a-z0-9]|$)/i.exec(text);
    if (code) return code[1].toLowerCase() + code[2].toLowerCase();
    const color = /\bwhite\b/i.test(text) ? 'w' : /\bblack\b/i.test(text) ? 'b' : null;
    const type = /\b(pawn|knight|bishop|rook|queen|king)s?\b/i.exec(text);
    if (!type) return null;
    return (color ?? '?') + TYPES[type[1].toLowerCase()];
  };

  const position: Record<string, string> = {};
  const candidates = board.querySelectorAll('piece, [data-piece], img, use, [class*="piece" i], [aria-label]');
  for (const el of candidates) {
    const code = identify(el);
    if (!code) continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area < cell * cell * 0.1 || area > cell * cell * 1.5) continue;
    const cx = r.left + r.width / 2 - rect.left;
    const cy = r.top + r.height / 2 - rect.top;
    if (cx < 0 || cy < 0 || cx >= cell * 8 || cy >= cell * 8) continue;
    const col = Math.floor(cx / cell);
    const row = Math.floor(cy / cell);
    const file = flipped ? 7 - col : col;
    const rank = flipped ? row : 7 - row;
    const square = String.fromCharCode(97 + file) + (rank + 1);
    if (!position[square]) position[square] = code;
  }
  return position;
}
