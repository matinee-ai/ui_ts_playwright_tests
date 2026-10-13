// Minimal move rules for the fixture boards: pawns, knights and kings only,
// which is all the framework tests play. position: { e2: 'wp', ... }
export function legalTargets(position, from, turn) {
  const piece = position[from];
  if (!piece || piece[0] !== turn) return [];
  const f = from.charCodeAt(0) - 97;
  const r = Number(from[1]) - 1;
  const sq = (ff, rr) => (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 ? String.fromCharCode(97 + ff) + (rr + 1) : null);
  const own = (s) => position[s] && position[s][0] === turn;
  const enemy = (s) => position[s] && position[s][0] !== turn;
  const out = [];
  switch (piece[1]) {
    case 'p': {
      const dir = turn === 'w' ? 1 : -1;
      const one = sq(f, r + dir);
      if (one && !position[one]) {
        out.push(one);
        const two = sq(f, r + 2 * dir);
        if ((turn === 'w' ? r === 1 : r === 6) && two && !position[two]) out.push(two);
      }
      for (const df of [-1, 1]) {
        const cap = sq(f + df, r + dir);
        if (cap && enemy(cap)) out.push(cap);
      }
      break;
    }
    case 'n':
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
        const t = sq(f + df, r + dr);
        if (t && !own(t)) out.push(t);
      }
      break;
    case 'k':
      for (let df = -1; df <= 1; df++)
        for (let dr = -1; dr <= 1; dr++) {
          const t = (df || dr) && sq(f + df, r + dr);
          if (t && !own(t)) out.push(t);
        }
      break;
  }
  return out;
}

export function startPosition() {
  const back = 'rnbqkbnr';
  const position = {};
  for (let i = 0; i < 8; i++) {
    const file = String.fromCharCode(97 + i);
    position[file + '1'] = 'w' + back[i];
    position[file + '2'] = 'wp';
    position[file + '7'] = 'bp';
    position[file + '8'] = 'b' + back[i];
  }
  return position;
}
