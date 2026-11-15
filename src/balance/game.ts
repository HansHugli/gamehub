// The rules of Balance, with no screen: a square grid where every cell is a circle or a
// square. No three alike in a line, every row and column holds as many circles as squares,
// and no two rows are the same, nor two columns. Every puzzle can be finished by reasoning
// alone, and the reasoning steps here are the ones a hint explains.

export type Rng = () => number;
/** 0 is empty, 1 a circle, 2 a square. */
export type Grid = number[];

export interface Puzzle {
  size: number;
  /** The cells given at the start; 0 where the player fills in. */
  givens: Grid;
  solution: Grid;
}

export type Reason = "pair" | "between" | "full" | "twin" | "trial";
export interface Deduction {
  index: number;
  value: number;
  reason: Reason;
  line: "row" | "column";
}

export const SIZES = [6, 8, 10] as const;
const other = (v: number): number => 3 - v;

const lineCache = new Map<number, { cells: number[]; kind: "row" | "column" }[]>();
/** Every row, then every column, as the cell indexes along it. */
export function lines(size: number): { cells: number[]; kind: "row" | "column" }[] {
  let all = lineCache.get(size);
  if (!all) {
    all = [];
    for (let r = 0; r < size; r++) all.push({ kind: "row", cells: Array.from({ length: size }, (_, c) => r * size + c) });
    for (let c = 0; c < size; c++) all.push({ kind: "column", cells: Array.from({ length: size }, (_, r) => r * size + c) });
    lineCache.set(size, all);
  }
  return all;
}

/** The cells that break a rule as the grid stands, and the first rule broken. */
export function conflicts(grid: Grid, size: number): { cells: Set<number>; rule: "" | "three" | "count" | "same"; line: "row" | "column" } {
  const cells = new Set<number>();
  let rule: "" | "three" | "count" | "same" = "";
  let line: "row" | "column" = "row";
  const note = (r: "three" | "count" | "same", kind: "row" | "column", which: number[]) => {
    if (!rule) [rule, line] = [r, kind];
    for (const i of which) cells.add(i);
  };
  const all = lines(size);
  for (const l of all) {
    for (let i = 0; i + 2 < size; i++) {
      const a = grid[l.cells[i]!]!;
      if (a && a === grid[l.cells[i + 1]!] && a === grid[l.cells[i + 2]!]) note("three", l.kind, l.cells.slice(i, i + 3));
    }
    for (const v of [1, 2]) {
      const of = l.cells.filter((i) => grid[i] === v);
      if (of.length > size / 2) note("count", l.kind, of);
    }
  }
  for (let a = 0; a < all.length; a++) {
    const la = all[a]!;
    if (la.cells.some((i) => !grid[i])) continue;
    for (let b = a + 1; b < all.length; b++) {
      const lb = all[b]!;
      if (lb.kind !== la.kind) continue;
      if (lb.cells.every((i, k) => grid[i] && grid[i] === grid[la.cells[k]!])) note("same", la.kind, [...la.cells, ...lb.cells]);
    }
  }
  return { cells, rule, line };
}

const broken = (grid: Grid, size: number): boolean => conflicts(grid, size).rule !== "";
export const full = (grid: Grid): boolean => grid.every((v) => v !== 0);
export const solved = (grid: Grid, size: number): boolean => full(grid) && !broken(grid, size);

/** The steps that follow at once from the rules, with no looking ahead. */
function plain(grid: Grid, size: number, twins = true): Deduction | null {
  const all = lines(size);
  for (const l of all) {
    for (let i = 0; i + 2 < size; i++) {
      const [x, y, z] = [l.cells[i]!, l.cells[i + 1]!, l.cells[i + 2]!];
      const [a, b, c] = [grid[x]!, grid[y]!, grid[z]!];
      if (a && a === b && !c) return { index: z, value: other(a), reason: "pair", line: l.kind };
      if (b && b === c && !a) return { index: x, value: other(b), reason: "pair", line: l.kind };
      if (a && a === c && !b) return { index: y, value: other(a), reason: "between", line: l.kind };
    }
  }
  for (const l of all) {
    const empty = l.cells.filter((i) => !grid[i]);
    if (empty.length === 0) continue;
    for (const v of [1, 2]) {
      if (l.cells.filter((i) => grid[i] === v).length === size / 2) return { index: empty[0]!, value: other(v), reason: "full", line: l.kind };
    }
  }
  if (!twins) return null;
  // Two cells left in a line, and a finished line that agrees with it everywhere else:
  // the two cells must go the other way round, or the lines would be the same
  for (const l of all) {
    const empty = l.cells.map((i, k) => (grid[i] ? -1 : k)).filter((k) => k >= 0);
    if (empty.length !== 2) continue;
    for (const m of all) {
      if (m === l || m.kind !== l.kind || m.cells.some((i) => !grid[i])) continue;
      if (!l.cells.every((i, k) => !grid[i] || grid[i] === grid[m.cells[k]!])) continue;
      const k = empty[0]!;
      return { index: l.cells[k]!, value: other(grid[m.cells[k]!]!), reason: "twin", line: l.kind };
    }
  }
  return null;
}

/** Fill in everything the plain steps give. False when that runs into a broken rule. */
function settle(grid: Grid, size: number): boolean {
  for (let d = plain(grid, size, false); d; d = plain(grid, size, false)) grid[d.index] = d.value;
  return !broken(grid, size);
}

/** The next cell that can be worked out, simplest reasoning first; null when none can. */
export function deduce(grid: Grid, size: number, trials = true): Deduction | null {
  const easy = plain(grid, size);
  if (easy || !trials) return easy;
  // Looking one step ahead: a value that leads straight to a broken rule is ruled out
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) continue;
    for (const v of [1, 2]) {
      const tried = grid.slice();
      tried[i] = v;
      if (!settle(tried, size)) return { index: i, value: other(v), reason: "trial", line: "row" };
    }
  }
  return null;
}

/** The grid after every step of reasoning has been taken. It is full when the puzzle is fair. */
export function reason(grid: Grid, size: number, trials = true): Grid {
  const out = grid.slice();
  for (let d = deduce(out, size, trials); d; d = deduce(out, size, trials)) out[d.index] = d.value;
  return out;
}

function shuffled<T>(list: T[], rng: Rng): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A finished grid that keeps every rule. */
export function finished(size: number, rng: Rng = Math.random): Grid {
  const grid: Grid = new Array<number>(size * size).fill(0);
  const half = size / 2;
  const fits = (i: number, v: number): boolean => {
    const r = Math.floor(i / size);
    const c = i % size;
    if (c >= 2 && grid[i - 1] === v && grid[i - 2] === v) return false;
    if (r >= 2 && grid[i - size] === v && grid[i - 2 * size] === v) return false;
    let inRow = 0;
    let inCol = 0;
    for (let k = 0; k < c; k++) if (grid[r * size + k] === v) inRow++;
    for (let k = 0; k < r; k++) if (grid[k * size + c] === v) inCol++;
    if (inRow >= half || inCol >= half) return false;
    // A row must still be able to reach half of each, and so must a column
    if (c + 1 - (inRow + 1) > half || r + 1 - (inCol + 1) > half) return false;
    if (c === size - 1) {
      for (let k = 0; k < r; k++) {
        let same = true;
        for (let j = 0; j < size && same; j++) same = (j === c ? v : grid[r * size + j]) === grid[k * size + j];
        if (same) return false;
      }
    }
    if (r === size - 1) {
      for (let k = 0; k < c; k++) {
        let same = true;
        for (let j = 0; j < size && same; j++) same = (j === r ? v : grid[j * size + c]) === grid[j * size + k];
        if (same) return false;
      }
    }
    return true;
  };
  let steps = 0;
  const fill = (i: number): boolean => {
    if (i === grid.length) return true;
    if (++steps > 200_000) return false;
    for (const v of rng() < 0.5 ? [1, 2] : [2, 1]) {
      if (!fits(i, v)) continue;
      grid[i] = v;
      if (fill(i + 1)) return true;
    }
    grid[i] = 0;
    return false;
  };
  while (!fill(0)) {
    grid.fill(0);
    steps = 0;
  }
  return grid;
}

/**
 * A puzzle: a finished grid with cells taken away one at a time, each only if what is left
 * can still be finished by reasoning. So there is one answer and no guessing. `trials` lets
 * the reasoning look one step ahead, which makes for fewer givens and a harder puzzle.
 */
export function makePuzzle(size: number, rng: Rng = Math.random, trials = true): Puzzle {
  const solution = finished(size, rng);
  const givens = solution.slice();
  for (const i of shuffled(givens.map((_, k) => k), rng)) {
    const kept = givens[i]!;
    givens[i] = 0;
    if (!full(reason(givens, size, trials))) givens[i] = kept;
  }
  return { size, givens, solution };
}

/** A saved puzzle read back, or null when it is not one this game could have made. */
export function restorePuzzle(saved: unknown): Puzzle | null {
  if (typeof saved !== "object" || saved === null) return null;
  const p = saved as Partial<Puzzle>;
  const size = p.size;
  if (typeof size !== "number" || !(SIZES as readonly number[]).includes(size)) return null;
  const grid = (g: unknown): g is Grid => Array.isArray(g) && g.length === size * size && g.every((v) => v === 0 || v === 1 || v === 2);
  if (!grid(p.givens) || !grid(p.solution) || !solved(p.solution, size)) return null;
  if (p.givens.some((v, i) => v !== 0 && v !== p.solution![i])) return null;
  return { size, givens: p.givens, solution: p.solution };
}

/** A saved grid for this puzzle: the right shape, with the givens untouched. */
export function fitsPuzzle(puzzle: Puzzle, grid: unknown): grid is Grid {
  return Array.isArray(grid) && grid.length === puzzle.givens.length && grid.every((v, i) => (v === 0 || v === 1 || v === 2) && (puzzle.givens[i] === 0 || v === puzzle.givens[i]));
}
