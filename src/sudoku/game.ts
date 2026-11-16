// Sudoku with a twist: every square that holds an even number is tinted. The tint is part
// of the puzzle, so far fewer numbers need to be given. No screen code here.

export type Level = "small" | "gentle" | "tricky";
export const LEVELS: readonly Level[] = ["small", "gentle", "tricky"];
/** Small is 6 by 6 in boxes of two rows by three; the others are the usual 9 by 9. */
export function sizeOf(level: Level): number {
  return level === "small" ? 6 : 9;
}

export interface Puzzle {
  level: Level;
  /** The numbers given, row by row; 0 is an empty square. */
  givens: number[];
  solution: number[];
}
export type Reason = "only" | "row" | "column" | "box" | "trial";
export interface Deduction {
  index: number;
  value: number;
  reason: Reason;
}

export interface Layout {
  n: number;
  boxRows: number;
  boxCols: number;
  /** Rows first, then columns, then boxes: n of each. */
  units: number[][];
  /** Every other square that shares a row, column or box with this one. */
  peers: number[][];
}
const layouts = new Map<number, Layout>();
export function layout(n: number): Layout {
  const known = layouts.get(n);
  if (known) return known;
  const boxRows = n === 6 ? 2 : Math.round(Math.sqrt(n));
  const boxCols = n / boxRows;
  const units: number[][] = Array.from({ length: 3 * n }, () => []);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      units[r]!.push(i);
      units[n + c]!.push(i);
      units[2 * n + Math.floor(r / boxRows) * boxRows + Math.floor(c / boxCols)]!.push(i);
    }
  }
  const peers = Array.from({ length: n * n }, (_, i) => {
    const set = new Set<number>();
    for (const unit of units) if (unit.includes(i)) for (const c of unit) if (c !== i) set.add(c);
    return [...set];
  });
  const made = { n, boxRows, boxCols, units, peers };
  layouts.set(n, made);
  return made;
}

/** Which squares are tinted: the ones whose number is even. */
export function tints(solution: readonly number[]): boolean[] {
  return solution.map((v) => v % 2 === 0);
}

function bits(mask: number): number {
  let count = 0;
  for (let m = mask; m; m &= m - 1) count++;
  return count;
}
function valuesOf(mask: number, n: number): number[] {
  const values: number[] = [];
  for (let v = 1; v <= n; v++) if (mask & (1 << v)) values.push(v);
  return values;
}
/** The numbers a square may still take, as a set of bits: by its tint and by what its peers hold. */
export function allowed(grid: readonly number[], even: readonly boolean[] | null, L: Layout, i: number): number {
  let mask = 0;
  for (let v = 1; v <= L.n; v++) if (!even || (v % 2 === 0) === even[i]) mask |= 1 << v;
  for (const p of L.peers[i]!) mask &= ~(1 << grid[p]!);
  return mask;
}

/** The empty square with the fewest numbers open to it; -1 when the grid is full, -2 when one has none. */
function tightest(g: readonly number[], even: readonly boolean[] | null, L: Layout): [number, number] {
  let best = -1;
  let bestMask = 0;
  let bestCount = 99;
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== 0) continue;
    const mask = allowed(g, even, L, i);
    const count = bits(mask);
    if (count === 0) return [-2, 0];
    if (count < bestCount) [best, bestMask, bestCount] = [i, mask, count];
  }
  return [best, bestMask];
}

/** How many ways the grid can be finished, counted up to a limit. Without tints, pass null. */
export function countSolutions(grid: readonly number[], even: readonly boolean[] | null, n: number, limit = 2): number {
  const L = layout(n);
  const g = grid.slice();
  let found = 0;
  const go = (): void => {
    const [at, mask] = tightest(g, even, L);
    if (at === -2) return;
    if (at === -1) {
      found++;
      return;
    }
    for (const v of valuesOf(mask, n)) {
      g[at] = v;
      go();
      if (found >= limit) break;
    }
    g[at] = 0;
  };
  go();
  return found;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
/** A full grid that keeps the rules, at random. */
export function solvedGrid(n: number, random: () => number = Math.random): number[] {
  const L = layout(n);
  const g = new Array<number>(n * n).fill(0);
  const go = (): boolean => {
    const [at, mask] = tightest(g, null, L);
    if (at === -2) return false;
    if (at === -1) return true;
    for (const v of shuffled(valuesOf(mask, n), random)) {
      g[at] = v;
      if (go()) return true;
    }
    g[at] = 0;
    return false;
  };
  go();
  return g;
}

const KINDS = ["row", "column", "box"] as const;
/** One square that can be filled in at a glance, or word that there is none, or that the grid cannot be finished. */
function single(g: readonly number[], even: readonly boolean[], L: Layout): Deduction | "stuck" | "clash" {
  const n = L.n;
  const masks = new Array<number>(g.length).fill(0);
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== 0) continue;
    masks[i] = allowed(g, even, L, i);
    if (!masks[i]) return "clash";
  }
  let found: Deduction | null = null;
  // A number with one place left in a box is the easiest to see, then in a row, then a column
  for (const kind of [2, 0, 1]) {
    for (let u = 0; u < n; u++) {
      const unit = L.units[kind * n + u]!;
      for (let v = 1; v <= n; v++) {
        let places = 0;
        let place = -1;
        let held = false;
        for (const c of unit) {
          if (g[c] === v) {
            held = true;
            break;
          }
          if (g[c] === 0 && masks[c]! & (1 << v)) {
            places++;
            place = c;
          }
        }
        if (held) continue;
        if (places === 0) return "clash";
        if (places === 1 && !found) found = { index: place, value: v, reason: KINDS[kind]! };
      }
    }
  }
  if (found) return found;
  for (let i = 0; i < g.length; i++) {
    if (g[i] === 0 && bits(masks[i]!) === 1) return { index: i, value: valuesOf(masks[i]!, n)[0]!, reason: "only" };
  }
  return "stuck";
}
/** Fill in everything that can be seen at a glance, one square after another. Changes the grid given. */
function run(g: number[], even: readonly boolean[], L: Layout): "solved" | "stuck" | "clash" {
  for (;;) {
    const s = single(g, even, L);
    if (s === "clash") return "clash";
    if (s === "stuck") return g.includes(0) ? "stuck" : "solved";
    g[s.index] = s.value;
  }
}
/** A square where every number but one soon runs into a clash. */
function trial(g: readonly number[], even: readonly boolean[], L: Layout): Deduction | null {
  const open: [number, number][] = [];
  for (let i = 0; i < g.length; i++) if (g[i] === 0) open.push([i, allowed(g, even, L, i)]);
  open.sort((a, b) => bits(a[1]) - bits(b[1]));
  for (const [i, mask] of open) {
    const alive: number[] = [];
    for (const v of valuesOf(mask, L.n)) {
      const h = g.slice();
      h[i] = v;
      if (run(h, even, L) !== "clash") alive.push(v);
      if (alive.length > 1) break;
    }
    if (alive.length === 1) return { index: i, value: alive[0]!, reason: "trial" };
  }
  return null;
}

/** The next square that can be worked out: at a glance if there is one, otherwise by trying. */
export function deduce(grid: readonly number[], even: readonly boolean[], n: number, trials = true): Deduction | null {
  const L = layout(n);
  const s = single(grid, even, L);
  if (typeof s === "object") return s;
  return s === "clash" || !trials ? null : trial(grid, even, L);
}
/** Whether the grid can be finished by those steps alone. If it can, it has one answer. */
export function solvable(grid: readonly number[], even: readonly boolean[], n: number, trials: boolean): boolean {
  const L = layout(n);
  const g = grid.slice();
  for (;;) {
    const r = run(g, even, L);
    if (r === "solved") return true;
    if (r === "clash" || !trials) return false;
    const d = trial(g, even, L);
    if (!d) return false;
    g[d.index] = d.value;
  }
}

/**
 * A new puzzle. Numbers are taken away one at a time for as long as it can still be worked out:
 * at a glance for small and gentle, and with some trying ahead for tricky.
 */
export function makePuzzle(level: Level, random: () => number = Math.random): Puzzle {
  const n = sizeOf(level);
  const solution = solvedGrid(n, random);
  const even = tints(solution);
  const givens = solution.slice();
  for (const i of shuffled(givens.map((_, k) => k), random)) {
    const keep = givens[i]!;
    givens[i] = 0;
    const fine = level === "tricky" ? countSolutions(givens, even, n) === 1 && solvable(givens, even, n, true) : solvable(givens, even, n, false);
    if (!fine) givens[i] = keep;
  }
  return { level, givens, solution };
}

export type Rule = "tint" | "plain" | "row" | "column" | "box";
/** The squares that break a rule as the grid stands, and the first rule broken. */
export function conflicts(grid: readonly number[], even: readonly boolean[], n: number): { cells: Set<number>; rule: Rule | null } {
  const L = layout(n);
  const cells = new Set<number>();
  let rule: Rule | null = null;
  grid.forEach((v, i) => {
    if (v === 0 || (v % 2 === 0) === even[i]) return;
    cells.add(i);
    rule ??= even[i] ? "tint" : "plain";
  });
  L.units.forEach((unit, u) => {
    for (const a of unit) {
      if (grid[a] === 0) continue;
      for (const b of unit) {
        if (a === b || grid[a] !== grid[b]) continue;
        cells.add(a);
        rule ??= KINDS[Math.floor(u / n)]!;
      }
    }
  });
  return { cells, rule };
}
export function solved(grid: readonly number[], even: readonly boolean[], n: number): boolean {
  return !grid.includes(0) && conflicts(grid, even, n).cells.size === 0;
}

function numbers(value: unknown, length: number, low: number, high: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((v) => Number.isInteger(v) && v >= low && v <= high);
}
/** A saved puzzle, if it is a real one with a single answer. */
export function restorePuzzle(value: unknown): Puzzle | null {
  const p = value as Partial<Puzzle> | null;
  if (!p || typeof p !== "object" || !LEVELS.includes(p.level as Level)) return null;
  const level = p.level as Level;
  const n = sizeOf(level);
  if (!numbers(p.solution, n * n, 1, n) || !numbers(p.givens, n * n, 0, n)) return null;
  const even = tints(p.solution);
  if (conflicts(p.solution, even, n).cells.size > 0) return null;
  if (p.givens.some((v, i) => v !== 0 && v !== p.solution![i])) return null;
  if (countSolutions(p.givens, even, n) !== 1) return null;
  return { level, givens: p.givens, solution: p.solution };
}
/** Whether a grid belongs to this puzzle: the right size, and every given still in place. */
export function fitsPuzzle(puzzle: Puzzle, grid: unknown): grid is number[] {
  const n = sizeOf(puzzle.level);
  return numbers(grid, n * n, 0, n) && puzzle.givens.every((v, i) => v === 0 || grid[i] === v);
}
