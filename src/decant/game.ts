// The rules of Decant, with no screen: bottles of layered colours, where the top colour of
// one bottle can be poured onto the same colour in another, or into an empty bottle. The
// puzzle is done when every bottle is empty or full of a single colour.

export type Rng = () => number;
/** A bottle from the bottom up; each number is a colour. */
export type Bottle = number[];
export type Move = [from: number, to: number];

/** How many layers a bottle holds. */
export const DEPTH = 4;
/** How many empty bottles a puzzle starts with. */
export const SPARE = 2;
/** The choices of how many colours a puzzle has. */
export const COLOURS = [4, 7, 10] as const;

const top = (b: Bottle): number | undefined => b[b.length - 1];
/** How many layers of the top colour sit together at the top. */
export function run(b: Bottle): number {
  let n = 0;
  for (let i = b.length - 1; i >= 0 && b[i] === top(b); i--) n++;
  return n;
}
export const complete = (b: Bottle): boolean => b.length === DEPTH && run(b) === DEPTH;
export const done = (bottles: Bottle[]): boolean => bottles.every((b) => b.length === 0 || complete(b));

export function canPour(bottles: Bottle[], from: number, to: number): boolean {
  const a = bottles[from];
  const b = bottles[to];
  if (!a || !b || from === to || a.length === 0 || b.length >= DEPTH) return false;
  return b.length === 0 || top(b) === top(a);
}

/** The bottles after pouring: as much of the top colour as the other bottle has room for. */
export function pour(bottles: Bottle[], from: number, to: number): { bottles: Bottle[]; moved: number } {
  if (!canPour(bottles, from, to)) return { bottles, moved: 0 };
  const a = bottles[from]!;
  const b = bottles[to]!;
  const moved = Math.min(run(a), DEPTH - b.length);
  const next = bottles.slice();
  next[from] = a.slice(0, a.length - moved);
  next[to] = [...b, ...a.slice(a.length - moved)];
  return { bottles: next, moved };
}

export function anyMove(bottles: Bottle[]): boolean {
  for (let i = 0; i < bottles.length; i++) for (let j = 0; j < bottles.length; j++) if (canPour(bottles, i, j)) return true;
  return false;
}

/** The pours worth trying from here, the most promising first. */
function worthwhile(bottles: Bottle[]): Move[] {
  const good: Move[] = [];
  const plain: Move[] = [];
  const intoEmpty: Move[] = [];
  const firstEmpty = bottles.findIndex((b) => b.length === 0);
  for (let i = 0; i < bottles.length; i++) {
    const a = bottles[i]!;
    if (a.length === 0 || complete(a)) continue;
    const n = run(a);
    for (let j = 0; j < bottles.length; j++) {
      if (!canPour(bottles, i, j)) continue;
      const b = bottles[j]!;
      if (b.length === 0) {
        // One empty bottle is as good as another, and moving a whole bottle into one changes nothing
        if (j !== firstEmpty || n === a.length) continue;
        intoEmpty.push([i, j]);
      } else if (n <= DEPTH - b.length) (run(b) === b.length ? good : plain).push([i, j]);
      // A pour that leaves part of the colour behind only splits it
    }
  }
  return [...good, ...plain, ...intoEmpty];
}

const key = (bottles: Bottle[]): string => bottles.map((b) => b.join(",")).sort().join("|");

/**
 * A way to finish from here as a list of pours: null when there is none, and "unknown" when
 * the search gave up before it could tell.
 */
export function solve(start: Bottle[], limit = 150_000): Move[] | null | "unknown" {
  if (done(start)) return [];
  const seen = new Set<string>([key(start)]);
  const path: Move[] = [];
  let gaveUp = false;
  const search = (bottles: Bottle[], depth: number): boolean => {
    if (done(bottles)) return true;
    if (depth > 600 || seen.size > limit) {
      gaveUp = true;
      return false;
    }
    for (const m of worthwhile(bottles)) {
      const next = pour(bottles, m[0], m[1]).bottles;
      const k = key(next);
      if (seen.has(k)) continue;
      seen.add(k);
      path.push(m);
      if (search(next, depth + 1)) return true;
      path.pop();
      if (gaveUp) return false;
    }
    return false;
  };
  if (search(start, 0)) return path;
  return gaveUp ? "unknown" : null;
}

/** A puzzle that can be finished: the colours mixed through the bottles, with two bottles empty. */
export function deal(colours: number, rng: Rng = Math.random): Bottle[] {
  for (;;) {
    const layers: number[] = [];
    for (let c = 1; c <= colours; c++) for (let k = 0; k < DEPTH; k++) layers.push(c);
    for (let i = layers.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      [layers[i], layers[j]] = [layers[j]!, layers[i]!];
    }
    const bottles: Bottle[] = [];
    for (let b = 0; b < colours; b++) bottles.push(layers.slice(b * DEPTH, (b + 1) * DEPTH));
    for (let s = 0; s < SPARE; s++) bottles.push([]);
    // A deal that starts with a bottle already sorted, or three alike on top, is too kind
    if (bottles.some((b) => complete(b) || run(b) >= 3)) continue;
    if (Array.isArray(solve(bottles))) return bottles;
  }
}

/** Saved bottles read back, or null when they are not a puzzle this game could be in. */
export function restore(saved: unknown): Bottle[] | null {
  if (!Array.isArray(saved)) return null;
  const colours = saved.length - SPARE;
  if (!(COLOURS as readonly number[]).includes(colours)) return null;
  const counts = new Map<number, number>();
  for (const b of saved as unknown[]) {
    if (!Array.isArray(b) || b.length > DEPTH) return null;
    for (const c of b as unknown[]) {
      if (typeof c !== "number" || !Number.isInteger(c) || c < 1 || c > colours) return null;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  if (counts.size !== colours || [...counts.values()].some((n) => n !== DEPTH)) return null;
  return (saved as Bottle[]).map((b) => b.slice());
}
