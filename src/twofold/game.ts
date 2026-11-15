// The rules of Twofold, with no screen: a 4 by 4 board of numbered tiles that slide
// together, where two equal tiles that meet become one tile of twice the value.

export const SIZE = 4;
/** The tile to make. Play goes on after it. */
export const TARGET = 4096;

export type Dir = "left" | "right" | "up" | "down";
export type Rng = () => number;

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface Game {
  tiles: Tile[];
  score: number;
  nextId: number;
  /** The target tile has been made at least once in this game. */
  reached: boolean;
}

export interface MoveResult {
  game: Game;
  /** False when nothing could slide that way; the game is unchanged and no tile is added. */
  moved: boolean;
  gained: number;
  /** Tiles that slid into a merge and are gone, at the cell where they ended. */
  absorbed: Tile[];
  /** Ids of the tiles a merge made. */
  merged: number[];
  /** This move made the target tile for the first time. */
  reachedNow: boolean;
}

/** The cell of slot `k` (0 is the edge tiles slide towards) on line `line`. */
function cell(dir: Dir, line: number, k: number): { row: number; col: number } {
  switch (dir) {
    case "left": return { row: line, col: k };
    case "right": return { row: line, col: SIZE - 1 - k };
    case "up": return { row: k, col: line };
    case "down": return { row: SIZE - 1 - k, col: line };
  }
}

/** Slide every tile as far as it goes. A tile merges at most once per move. */
export function move(game: Game, dir: Dir): MoveResult {
  const at = new Map<number, Tile>(game.tiles.map((t) => [t.row * SIZE + t.col, t]));
  const tiles: Tile[] = [];
  const absorbed: Tile[] = [];
  const merged: number[] = [];
  let nextId = game.nextId;
  let gained = 0;
  let moved = false;
  for (let line = 0; line < SIZE; line++) {
    const placed: Tile[] = [];
    let lastMerged = false;
    for (let k = 0; k < SIZE; k++) {
      const from = cell(dir, line, k);
      const t = at.get(from.row * SIZE + from.col);
      if (!t) continue;
      const last = placed[placed.length - 1];
      if (last && !lastMerged && last.value === t.value) {
        const made: Tile = { id: nextId++, value: t.value * 2, row: last.row, col: last.col };
        absorbed.push(last, { ...t, row: last.row, col: last.col });
        placed[placed.length - 1] = made;
        merged.push(made.id);
        gained += made.value;
        lastMerged = true;
        moved = true;
      } else {
        const to = cell(dir, line, placed.length);
        if (to.row !== t.row || to.col !== t.col) moved = true;
        placed.push({ ...t, row: to.row, col: to.col });
        lastMerged = false;
      }
    }
    tiles.push(...placed);
  }
  if (!moved) return { game, moved: false, gained: 0, absorbed: [], merged: [], reachedNow: false };
  const reachedNow = !game.reached && tiles.some((t) => t.value >= TARGET);
  return { game: { tiles, score: game.score + gained, nextId, reached: game.reached || reachedNow }, moved, gained, absorbed, merged, reachedNow };
}

/** Add a tile on a free cell: a 2 nine times in ten, otherwise a 4. Null when the board is full. */
export function spawn(game: Game, rng: Rng = Math.random): { game: Game; tile: Tile } | null {
  const taken = new Set(game.tiles.map((t) => t.row * SIZE + t.col));
  const free: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const where = free[Math.min(free.length - 1, Math.floor(rng() * free.length))]!;
  const tile: Tile = { id: game.nextId, value: rng() < 0.9 ? 2 : 4, row: Math.floor(where / SIZE), col: where % SIZE };
  return { game: { ...game, tiles: [...game.tiles, tile], nextId: game.nextId + 1 }, tile };
}

export function newGame(rng: Rng = Math.random): Game {
  let game: Game = { tiles: [], score: 0, nextId: 1, reached: false };
  for (let i = 0; i < 2; i++) game = spawn(game, rng)!.game;
  return game;
}

/** A move is left while a cell is free or two equal tiles touch. */
export function canMove(game: Game): boolean {
  if (game.tiles.length < SIZE * SIZE) return true;
  const at = new Map<number, number>(game.tiles.map((t) => [t.row * SIZE + t.col, t.value]));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = at.get(r * SIZE + c);
      if (c + 1 < SIZE && at.get(r * SIZE + c + 1) === v) return true;
      if (r + 1 < SIZE && at.get((r + 1) * SIZE + c) === v) return true;
    }
  }
  return false;
}

export const highest = (game: Game): number => game.tiles.reduce((m, t) => Math.max(m, t.value), 0);

/** A saved game read back, or null when it is not a board this game could have made. */
export function restore(saved: unknown): Game | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as Partial<Game>;
  if (!Array.isArray(s.tiles) || typeof s.score !== "number" || typeof s.nextId !== "number") return null;
  const seen = new Set<number>();
  const ids = new Set<number>();
  const tiles: Tile[] = [];
  for (const t of s.tiles as Partial<Tile>[]) {
    const { id, value, row, col } = t ?? {};
    if (!Number.isInteger(id) || !Number.isInteger(value) || !Number.isInteger(row) || !Number.isInteger(col)) return null;
    if (row! < 0 || row! >= SIZE || col! < 0 || col! >= SIZE) return null;
    if (value! < 2 || (value! & (value! - 1)) !== 0) return null;
    if (seen.has(row! * SIZE + col!) || ids.has(id!) || id! >= s.nextId) return null;
    seen.add(row! * SIZE + col!);
    ids.add(id!);
    tiles.push({ id: id!, value: value!, row: row!, col: col! });
  }
  if (tiles.length === 0 || s.score < 0) return null;
  return { tiles, score: s.score, nextId: s.nextId, reached: s.reached === true || tiles.some((t) => t.value >= TARGET) };
}
