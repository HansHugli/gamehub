// The rules of Word Ladder, with no screen: get from one word to another by changing one
// letter at a time, where every step is a word.

export type Rng = () => number;

export interface Puzzle {
  start: string;
  end: string;
  /** The fewest steps it can be done in with everyday words. */
  par: number;
}

/** A word list cut out of letters run together, every `length` letters one word. */
export function unpack(letters: string, length = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i + length <= letters.length; i += length) out.push(letters.slice(i, i + length));
  return out;
}

/** The two words differ in exactly one place. */
export function oneApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++differ > 1) return false;
  return differ === 1;
}

/** A set of words that knows which of them are one letter apart. */
export class Lexicon {
  readonly words: ReadonlySet<string>;
  private readonly byPattern = new Map<string, string[]>();

  constructor(words: Iterable<string>) {
    this.words = new Set(words);
    for (const w of this.words) {
      for (let i = 0; i < w.length; i++) {
        const key = w.slice(0, i) + "_" + w.slice(i + 1);
        const list = this.byPattern.get(key);
        if (list) list.push(w);
        else this.byPattern.set(key, [w]);
      }
    }
  }

  has(word: string): boolean {
    return this.words.has(word);
  }

  /** The words of this set one letter away from `word` (which need not be in the set). */
  neighbours(word: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < word.length; i++) {
      for (const w of this.byPattern.get(word.slice(0, i) + "_" + word.slice(i + 1)) ?? []) if (w !== word) out.push(w);
    }
    return out;
  }

  /** How many steps every reachable word is from `from`. */
  distances(from: string, limit = Infinity): Map<string, number> {
    const seen = new Map<string, number>([[from, 0]]);
    let edge = [from];
    for (let d = 1; edge.length > 0 && d <= limit; d++) {
      const next: string[] = [];
      for (const w of edge) {
        for (const n of this.neighbours(w)) {
          if (seen.has(n)) continue;
          seen.set(n, d);
          next.push(n);
        }
      }
      edge = next;
    }
    return seen;
  }

  /** A shortest ladder from one word to the other, both ends included, or null when there is none. */
  path(from: string, to: string): string[] | null {
    if (from === to) return [from];
    // Search back from the end, so each step forward can pick a word that is one nearer
    const toEnd = this.distances(to);
    let left = toEnd.get(from);
    if (left === undefined) {
      // `from` may be a word outside this set: start from its nearest neighbour inside it
      const inside = this.neighbours(from).filter((n) => toEnd.has(n)).sort((a, b) => toEnd.get(a)! - toEnd.get(b)!)[0];
      if (inside === undefined) return null;
      const rest = this.path(inside, to);
      return rest ? [from, ...rest] : null;
    }
    const out = [from];
    let at = from;
    while (left > 0) {
      const next = this.neighbours(at).find((n) => toEnd.get(n) === left! - 1);
      if (next === undefined) return null;
      out.push(next);
      at = next;
      left--;
    }
    return out;
  }
}

/** A puzzle between two given words, or null when everyday words do not join them. */
export function puzzleBetween(common: Lexicon, start: string, end: string): Puzzle | null {
  if (!common.has(start) || !common.has(end) || start === end) return null;
  const path = common.path(start, end);
  return path ? { start, end, par: path.length - 1 } : null;
}

/**
 * A puzzle made up on the spot: a start word with a few ways out of it, and an end word
 * `min` to `max` steps away that shares no letter in place with it.
 */
export function randomPuzzle(common: Lexicon, rng: Rng = Math.random, min = 3, max = 5): Puzzle {
  const words = [...common.words];
  const pick = <T>(list: T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;
  for (let tries = 0; tries < 400; tries++) {
    const start = pick(words);
    if (common.neighbours(start).length < 3) continue;
    const par = min + Math.min(max - min, Math.floor(rng() * (max - min + 1)));
    const ends: string[] = [];
    for (const [w, d] of common.distances(start, par)) {
      if (d !== par || common.neighbours(w).length < 3) continue;
      // An end that keeps none of the start's letters in place reads as a real change
      if ([...w].some((ch, i) => ch === start[i])) continue;
      ends.push(w);
    }
    if (ends.length > 0) return { start, end: pick(ends), par };
  }
  throw new Error("No puzzle could be made from this word list.");
}

/**
 * The ladder after trying `word` as the next step. A word already on the ladder climbs back
 * down to it; anything else must be one letter from the top and a known word.
 */
export function step(ladder: string[], word: string, accepted: Lexicon): { ladder: string[]; problem: "" | "same" | "far" | "unknown" } {
  const top = ladder[ladder.length - 1]!;
  if (word === top) return { ladder, problem: "same" };
  if (!oneApart(top, word)) return { ladder, problem: "far" };
  const back = ladder.indexOf(word);
  if (back >= 0) return { ladder: ladder.slice(0, back + 1), problem: "" };
  if (!accepted.has(word)) return { ladder, problem: "unknown" };
  return { ladder: [...ladder, word], problem: "" };
}

/** Whether a ladder is a real one for this puzzle so far: starts right, and every step holds. */
export function validLadder(puzzle: Puzzle, ladder: unknown, accepted: Lexicon): ladder is string[] {
  if (!Array.isArray(ladder) || ladder.length === 0 || ladder[0] !== puzzle.start) return false;
  for (let i = 0; i < ladder.length; i++) {
    const w: unknown = ladder[i];
    if (typeof w !== "string" || !accepted.has(w)) return false;
    if (i > 0 && !oneApart(ladder[i - 1] as string, w)) return false;
    if (ladder.indexOf(w) !== i) return false;
  }
  return true;
}
