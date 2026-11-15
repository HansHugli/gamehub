// The rules of Solitaire (Klondike), with no screen. Seven columns are built down in
// alternating colours, four foundations are built up by suit from the ace, and the rest of
// the pack is turned over from the stock one or three cards at a time.

export type Rng = () => number;
/** A card is a number 0 to 51: thirteen ranks of each of four suits. */
export type Card = number;
export const suitOf = (c: Card): number => Math.floor(c / 13);
/** 1 is the ace, 13 the king. */
export const rankOf = (c: Card): number => (c % 13) + 1;
/** Suits 1 and 2 (hearts, diamonds) are red. */
export const isRed = (c: Card): boolean => suitOf(c) === 1 || suitOf(c) === 2;

export interface Column {
  /** Face down, the bottom of the column first. */
  down: Card[];
  /** Face up, on top of the face-down cards; the last is the free card. */
  up: Card[];
}
export interface Game {
  /** The last card is the next one turned over. */
  stock: Card[];
  /** The last card is the one that can be played. */
  waste: Card[];
  /** One pile per suit, by suit number. */
  foundations: Card[][];
  columns: Column[];
  /** How many cards are turned from the stock at a time. */
  draw: 1 | 3;
  moves: number;
}

export type Place = { pile: "waste" } | { pile: "foundation"; suit: number } | { pile: "column"; col: number };
export interface Move {
  from: Place;
  to: Place;
  /** How many cards go: more than one only between columns. */
  count: number;
}

export function deal(rng: Rng = Math.random, draw: 1 | 3 = 1): Game {
  const pack: Card[] = Array.from({ length: 52 }, (_, i) => i);
  for (let i = pack.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [pack[i], pack[j]] = [pack[j]!, pack[i]!];
  }
  const columns: Column[] = [];
  for (let col = 0; col < 7; col++) {
    const cards = pack.splice(0, col + 1);
    columns.push({ down: cards.slice(0, col), up: cards.slice(col) });
  }
  return { stock: pack, waste: [], foundations: [[], [], [], []], columns, draw, moves: 0 };
}

export const won = (g: Game): boolean => g.foundations.every((f) => f.length === 13);

export function fitsFoundation(g: Game, card: Card): boolean {
  return g.foundations[suitOf(card)]!.length === rankOf(card) - 1;
}
export function fitsColumn(g: Game, card: Card, col: number): boolean {
  const c = g.columns[col]!;
  const on = c.up[c.up.length - 1];
  if (on === undefined) return c.down.length === 0 && rankOf(card) === 13;
  return isRed(on) !== isRed(card) && rankOf(on) === rankOf(card) + 1;
}

/** The cards a move would carry, the lowest first; empty when there are not that many to take. */
function carried(g: Game, from: Place, count: number): Card[] {
  if (count < 1) return [];
  if (from.pile === "waste") return count === 1 ? g.waste.slice(-1) : [];
  if (from.pile === "foundation") return count === 1 ? g.foundations[from.suit]!.slice(-1) : [];
  const up = g.columns[from.col]?.up ?? [];
  return count <= up.length ? up.slice(up.length - count) : [];
}

export function legal(g: Game, m: Move): boolean {
  const cards = carried(g, m.from, m.count);
  const first = cards[0];
  if (first === undefined) return false;
  if (m.to.pile === "waste") return false;
  if (m.to.pile === "foundation") return cards.length === 1 && m.from.pile !== "foundation" && m.to.suit === suitOf(first) && fitsFoundation(g, first);
  if (m.from.pile === "column" && m.from.col === m.to.col) return false;
  return fitsColumn(g, first, m.to.col);
}

/** The game after a move, with the card it uncovers turned face up. The game given is not changed. */
export function play(g: Game, m: Move): Game | null {
  if (!legal(g, m)) return null;
  const next: Game = { ...g, waste: g.waste.slice(), foundations: g.foundations.map((f) => f.slice()), columns: g.columns.map((c) => ({ down: c.down.slice(), up: c.up.slice() })), moves: g.moves + 1 };
  let cards: Card[];
  if (m.from.pile === "waste") cards = next.waste.splice(-1);
  else if (m.from.pile === "foundation") cards = next.foundations[m.from.suit]!.splice(-1);
  else {
    const c = next.columns[m.from.col]!;
    cards = c.up.splice(c.up.length - m.count);
    if (c.up.length === 0 && c.down.length > 0) c.up.push(c.down.pop()!);
  }
  if (m.to.pile === "foundation") next.foundations[m.to.suit]!.push(...cards);
  else if (m.to.pile === "column") next.columns[m.to.col]!.up.push(...cards);
  return next;
}

/** Turn cards from the stock, or when it is empty turn the waste back over. Null when both are empty. */
export function turn(g: Game): Game | null {
  if (g.stock.length === 0) {
    if (g.waste.length === 0) return null;
    return { ...g, stock: g.waste.slice().reverse(), waste: [], moves: g.moves + 1 };
  }
  const n = Math.min(g.draw, g.stock.length);
  const stock = g.stock.slice(0, g.stock.length - n);
  return { ...g, stock, waste: [...g.waste, ...g.stock.slice(g.stock.length - n).reverse()], moves: g.moves + 1 };
}

/**
 * Where a tapped card should go: the foundation when it fits, otherwise the column where
 * it does the most good. `count` cards are taken, the tapped one lowest.
 */
export function bestMove(g: Game, from: Place, count: number): Move | null {
  const first = carried(g, from, count)[0];
  if (first === undefined) return null;
  if (count === 1 && from.pile !== "foundation") {
    const up: Move = { from, to: { pile: "foundation", suit: suitOf(first) }, count };
    if (legal(g, up)) return up;
  }
  let best: Move | null = null;
  let bestWorth = -1;
  for (let col = 0; col < 7; col++) {
    const m: Move = { from, to: { pile: "column", col }, count };
    if (!legal(g, m)) continue;
    const target = g.columns[col]!;
    // Onto a card is better than into an empty column, which is better kept for a king that needs it
    let worth = target.up.length > 0 ? 2 : 1;
    if (from.pile === "column") {
      const source = g.columns[from.col]!;
      // Moving a whole column's king from one empty-bottomed place to another does nothing
      if (target.up.length === 0 && source.down.length === 0 && count === source.up.length) continue;
    }
    if (worth > bestWorth) [best, bestWorth] = [m, worth];
  }
  return best;
}

/** Whether every card is in sight and reachable, so the game can be played out without thought. */
export function canFinish(g: Game): boolean {
  if (won(g) || g.columns.some((c) => c.down.length > 0)) return false;
  return g.draw === 1 || g.stock.length + g.waste.length === 0;
}

/** The next step of playing a finished game out: a card to its foundation, or a turn of the stock. */
export function finishStep(g: Game): Game | null {
  for (let col = 0; col < 7; col++) {
    const next = play(g, { from: { pile: "column", col }, to: { pile: "foundation", suit: suitOf(g.columns[col]!.up.at(-1) ?? 0) }, count: 1 });
    if (next) return next;
  }
  const top = g.waste.at(-1);
  if (top !== undefined) {
    const next = play(g, { from: { pile: "waste" }, to: { pile: "foundation", suit: suitOf(top) }, count: 1 });
    if (next) return next;
  }
  return turn(g);
}

export type Hint = { kind: "move"; move: Move } | { kind: "turn" } | { kind: "none" };

/** A move worth making, the most useful kind first. */
export function hint(g: Game): Hint {
  const places: { from: Place; count: number }[] = [];
  g.columns.forEach((c, col) => {
    for (let count = c.up.length; count >= 1; count--) places.push({ from: { pile: "column", col }, count });
  });
  // A column card that uncovers a face-down card, or goes to a foundation
  for (const p of places) {
    if (p.from.pile !== "column") continue;
    const c = g.columns[p.from.col]!;
    const m = bestMove(g, p.from, p.count);
    if (!m) continue;
    if (m.to.pile === "foundation") return { kind: "move", move: m };
    if (p.count === c.up.length && c.down.length > 0) return { kind: "move", move: m };
  }
  if (g.waste.length > 0) {
    const m = bestMove(g, { pile: "waste" }, 1);
    if (m) return { kind: "move", move: m };
  }
  // Emptying a column for a king that is waiting on face-down cards
  for (const p of places) {
    if (p.from.pile !== "column") continue;
    const c = g.columns[p.from.col]!;
    if (p.count !== c.up.length || c.down.length > 0) continue;
    const m = bestMove(g, p.from, p.count);
    if (m && m.to.pile === "column" && g.columns[m.to.col]!.up.length > 0 && g.columns.some((k) => k.down.length > 0 && rankOf(k.up[0] ?? 0) === 13)) return { kind: "move", move: m };
  }
  if (g.stock.length > 0) return { kind: "turn" };
  // Would another pass through the waste give anything to play?
  if (g.waste.some((card) => fitsFoundation(g, card) || g.columns.some((_, col) => fitsColumn(g, card, col)))) return { kind: "turn" };
  return { kind: "none" };
}

/** A saved game read back, or null when it is not a real game: every card once, piles in order. */
export function restore(saved: unknown): Game | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as Partial<Game>;
  const cards = (v: unknown): v is Card[] => Array.isArray(v) && v.every((c) => typeof c === "number" && Number.isInteger(c) && c >= 0 && c < 52);
  if (!cards(s.stock) || !cards(s.waste) || !Array.isArray(s.foundations) || s.foundations.length !== 4 || !Array.isArray(s.columns) || s.columns.length !== 7) return null;
  if (!s.foundations.every(cards) || !s.columns.every((c) => typeof c === "object" && c !== null && cards(c.down) && cards(c.up))) return null;
  const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.columns.flatMap((c) => [...c.down, ...c.up])];
  if (all.length !== 52 || new Set(all).size !== 52) return null;
  if (!s.foundations.every((f, suit) => f.every((c, i) => suitOf(c) === suit && rankOf(c) === i + 1))) return null;
  for (const c of s.columns) {
    if (c.up.length === 0 && c.down.length > 0) return null;
    for (let i = 1; i < c.up.length; i++) if (isRed(c.up[i]!) === isRed(c.up[i - 1]!) || rankOf(c.up[i]!) !== rankOf(c.up[i - 1]!) - 1) return null;
  }
  return {
    stock: s.stock.slice(), waste: s.waste.slice(), foundations: s.foundations.map((f) => f.slice()), columns: s.columns.map((c) => ({ down: c.down.slice(), up: c.up.slice() })),
    draw: s.draw === 3 ? 3 : 1, moves: typeof s.moves === "number" && s.moves >= 0 ? Math.floor(s.moves) : 0,
  };
}
