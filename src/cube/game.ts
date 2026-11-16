// Cube Paint: the rules, with no screen code.
//
// A cube with coloured faces rolls over a floor of tiles. The face that lands underneath
// stamps its colour on the tile, over whatever was there. Some tiles ask for a colour;
// the level is solved when every one of those shows the colour it asks for.

/** A roll: 0 up the screen (north), 1 right (east), 2 down (south), 3 left (west). */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];
/** How a roll is written in a saved game. */
export const LETTERS = "NESW";

/** The six places a face can be. */
export const TOP = 0;
export const UNDER = 1;
export const NORTH = 2;
export const SOUTH = 3;
export const EAST = 4;
export const WEST = 5;

/** For each roll, the place every face comes from: `next[place] = now[FROM[dir][place]]`. */
const FROM: readonly (readonly number[])[] = [
  [SOUTH, NORTH, TOP, UNDER, EAST, WEST],
  [WEST, EAST, NORTH, SOUTH, TOP, UNDER],
  [NORTH, SOUTH, UNDER, TOP, EAST, WEST],
  [EAST, WEST, NORTH, SOUTH, UNDER, TOP],
];

/** Every way round the cube can sit (24 of them), as which face is in each place. */
const SITS: number[][] = [];
/** `TURN[sit * 4 + dir]` is how the cube sits after that roll. */
const TURN: number[] = [];
(function tabulate(): void {
  const seen = new Map<string, number>();
  const add = (faces: number[]): number => {
    const key = faces.join("");
    const known = seen.get(key);
    if (known !== undefined) return known;
    seen.set(key, SITS.length);
    SITS.push(faces);
    return SITS.length - 1;
  };
  add([0, 1, 2, 3, 4, 5]);
  for (let s = 0; s < SITS.length; s++) {
    const now = SITS[s]!;
    for (const d of DIRS) TURN[s * 4 + d] = add(FROM[d]!.map((place) => now[place]!));
  }
})();
export const SIT_COUNT: number = SITS.length;

export interface Level {
  /** Its number, from 1. */
  n: number;
  w: number;
  h: number;
  /** Row by row: is there a tile here? */
  floor: boolean[];
  /** Row by row: the colour this tile asks for, or 0 when it does not matter. */
  want: number[];
  /** The cell the cube starts on. */
  start: number;
  /** The colour (1 to 6) of each face, by the place it starts in. */
  faces: number[];
  /** The fewest rolls that solve it. */
  par: number;
}

export interface State {
  at: number;
  /** How the cube sits: an index into the 24 ways. */
  sit: number;
  /** Row by row: the colour stamped on each tile, 0 for none. */
  paint: number[];
}

export function begin(level: Level): State {
  return { at: level.start, sit: 0, paint: level.floor.map(() => 0) };
}

/** The colour showing in each of the six places. */
export function showing(level: Level, state: State): number[] {
  return SITS[state.sit]!.map((face) => level.faces[face]!);
}

/** The cell a roll leads to, or -1 when there is no tile that way. */
export function ahead(level: Level, at: number, dir: Dir): number {
  const x = (at % level.w) + DX[dir]!;
  const y = Math.floor(at / level.w) + DY[dir]!;
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return -1;
  const to = y * level.w + x;
  return level.floor[to] ? to : -1;
}

/** The game after a roll, or null when the cube cannot go that way. */
export function roll(level: Level, state: State, dir: Dir): State | null {
  const to = ahead(level, state.at, dir);
  if (to < 0) return null;
  const sit = TURN[state.sit * 4 + dir]!;
  const paint = state.paint.slice();
  paint[to] = level.faces[SITS[sit]![UNDER]!]!;
  return { at: to, sit, paint };
}

export function solved(level: Level, state: State): boolean {
  return level.want.every((colour, i) => colour === 0 || state.paint[i] === colour);
}

/** How many of the asking tiles show their colour, and how many ask. */
export function tally(level: Level, state: State): { right: number; asked: number } {
  let right = 0;
  let asked = 0;
  level.want.forEach((colour, i) => {
    if (colour === 0) return;
    asked++;
    if (state.paint[i] === colour) right++;
  });
  return { right, asked };
}

/** The game after a saved run of rolls, or null if the run is not one this level allows. */
export function replay(level: Level, rolls: string): State | null {
  let state = begin(level);
  for (const letter of rolls) {
    const dir = LETTERS.indexOf(letter);
    if (dir < 0) return null;
    const next = roll(level, state, dir as Dir);
    if (!next) return null;
    state = next;
  }
  return state;
}

/**
 * The shortest run of rolls that solves the level from here, or null when there is none.
 * Only the asking tiles matter, and of those only whether each is right, so the search is
 * over (cell, way the cube sits, which asking tiles are right).
 */
export function solve(level: Level, state: State): Dir[] | null {
  const asking: number[] = [];
  level.want.forEach((colour, i) => {
    if (colour !== 0) asking.push(i);
  });
  const k = asking.length;
  if (k > 12) return null;
  const bitOf = level.floor.map(() => -1);
  asking.forEach((cell, bit) => (bitOf[cell] = bit));
  const full = (1 << k) - 1;
  let mask = 0;
  asking.forEach((cell, bit) => {
    if (state.paint[cell] === level.want[cell]) mask |= 1 << bit;
  });
  const first = ((state.at * SIT_COUNT + state.sit) << k) | mask;
  if (mask === full) return [];

  const size = (level.floor.length * SIT_COUNT) << k;
  const from = new Int32Array(size).fill(-1);
  const by = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  queue[tail++] = first;
  from[first] = first;
  while (head < tail) {
    const code = queue[head++]!;
    const seen = code & full;
    const where = code >> k;
    const sit = where % SIT_COUNT;
    const at = (where - sit) / SIT_COUNT;
    for (const d of DIRS) {
      const to = ahead(level, at, d);
      if (to < 0) continue;
      const nextSit = TURN[sit * 4 + d]!;
      let next = seen;
      const bit = bitOf[to]!;
      if (bit >= 0) {
        const stamp = level.faces[SITS[nextSit]![UNDER]!]!;
        next = stamp === level.want[to] ? seen | (1 << bit) : seen & ~(1 << bit);
      }
      const nextCode = ((to * SIT_COUNT + nextSit) << k) | next;
      if (from[nextCode] !== -1) continue;
      from[nextCode] = code;
      by[nextCode] = d;
      if (next === full) {
        const path: Dir[] = [];
        for (let c = nextCode; c !== first; c = from[c]!) path.push(by[c] as Dir);
        return path.reverse();
      }
      queue[tail++] = nextCode;
    }
  }
  return null;
}

/** What a level of a given number is made of. */
interface Recipe {
  w: number;
  h: number;
  /** How many cells have no tile. */
  holes: number;
  /** 3: opposite faces share a colour. 6: every face has its own. */
  colours: 3 | 6;
  /** How many tiles ask for a colour. */
  asking: number;
  /** The fewest and most rolls the shortest answer should take. */
  least: number;
  most: number;
}

/** The first levels, in order. Later ones repeat the last recipe with other floors. */
export const RECIPES: readonly Recipe[] = [
  { w: 3, h: 3, holes: 0, colours: 3, asking: 1, least: 2, most: 3 },
  { w: 3, h: 3, holes: 0, colours: 3, asking: 2, least: 4, most: 5 },
  { w: 3, h: 3, holes: 0, colours: 3, asking: 3, least: 6, most: 8 },
  { w: 3, h: 3, holes: 0, colours: 3, asking: 4, least: 8, most: 10 },
  { w: 4, h: 3, holes: 0, colours: 3, asking: 5, least: 10, most: 12 },
  { w: 4, h: 4, holes: 0, colours: 3, asking: 6, least: 12, most: 15 },
  { w: 3, h: 3, holes: 0, colours: 6, asking: 2, least: 5, most: 7 },
  { w: 3, h: 3, holes: 0, colours: 6, asking: 3, least: 8, most: 10 },
  { w: 4, h: 3, holes: 0, colours: 6, asking: 4, least: 10, most: 13 },
  { w: 4, h: 4, holes: 0, colours: 6, asking: 5, least: 12, most: 15 },
  { w: 4, h: 4, holes: 2, colours: 3, asking: 6, least: 13, most: 16 },
  { w: 4, h: 4, holes: 2, colours: 6, asking: 4, least: 12, most: 15 },
  { w: 4, h: 4, holes: 3, colours: 6, asking: 5, least: 14, most: 17 },
  { w: 5, h: 4, holes: 2, colours: 6, asking: 5, least: 14, most: 17 },
  { w: 5, h: 4, holes: 3, colours: 6, asking: 6, least: 16, most: 19 },
  { w: 5, h: 5, holes: 3, colours: 6, asking: 6, least: 17, most: 20 },
  { w: 5, h: 5, holes: 4, colours: 6, asking: 6, least: 18, most: 21 },
  { w: 5, h: 5, holes: 4, colours: 6, asking: 7, least: 19, most: 22 },
  { w: 5, h: 5, holes: 5, colours: 6, asking: 7, least: 20, most: 23 },
  { w: 5, h: 5, holes: 5, colours: 6, asking: 7, least: 21, most: 25 },
];

/** The colours of the faces, by starting place: top, under, north, south, east, west. */
const FACES_3: readonly number[] = [1, 1, 2, 2, 3, 3];
const FACES_6: readonly number[] = [1, 2, 3, 4, 5, 6];

/** A small random source that gives the same run for the same seed on every browser. */
function source(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function joined(w: number, h: number, floor: boolean[]): boolean {
  const first = floor.indexOf(true);
  if (first < 0) return false;
  const seen = floor.map(() => false);
  const stack = [first];
  seen[first] = true;
  let count = 1;
  while (stack.length > 0) {
    const at = stack.pop()!;
    for (const d of DIRS) {
      const x = (at % w) + DX[d]!;
      const y = Math.floor(at / w) + DY[d]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const to = y * w + x;
      if (!floor[to] || seen[to]) continue;
      seen[to] = true;
      count++;
      stack.push(to);
    }
  }
  return count === floor.filter(Boolean).length;
}

const made = new Map<number, Level>();

/**
 * The level of a given number, the same every time. Floors are tried from a seeded random
 * source until one has a shortest answer of the length the recipe asks for; if none does,
 * the nearest one found is used. Every level returned has an answer.
 */
export function makeLevel(n: number): Level {
  const known = made.get(n);
  if (known) return known;
  const recipe = RECIPES[Math.min(n, RECIPES.length) - 1]!;
  const random = source(n * 7919 + 17);
  const pick = (count: number): number => Math.floor(random() * count);
  const cells = recipe.w * recipe.h;
  const faces = (recipe.colours === 3 ? FACES_3 : FACES_6).slice();
  const middle = (recipe.least + recipe.most) / 2;
  let best: Level | null = null;
  let bestMiss = Infinity;
  for (let attempt = 0; attempt < 400; attempt++) {
    const floor = new Array<boolean>(cells).fill(true);
    for (let holes = 0; holes < recipe.holes; ) {
      const cell = pick(cells);
      if (!floor[cell]) continue;
      floor[cell] = false;
      holes++;
    }
    if (!joined(recipe.w, recipe.h, floor)) continue;
    const tiles: number[] = [];
    floor.forEach((there, i) => {
      if (there) tiles.push(i);
    });
    const start = tiles[pick(tiles.length)]!;
    const want = new Array<number>(cells).fill(0);
    for (let asking = 0; asking < recipe.asking; ) {
      const cell = tiles[pick(tiles.length)]!;
      if (want[cell] !== 0) continue;
      want[cell] = 1 + pick(recipe.colours);
      asking++;
    }
    const level: Level = { n, w: recipe.w, h: recipe.h, floor, want, start, faces, par: 0 };
    const answer = solve(level, begin(level));
    if (!answer) continue;
    level.par = answer.length;
    const miss = level.par < recipe.least ? recipe.least - level.par : level.par > recipe.most ? level.par - recipe.most : 0;
    const score = miss * 100 + Math.abs(level.par - middle);
    if (score < bestMiss) {
      best = level;
      bestMiss = score;
    }
    if (miss === 0 && attempt >= 40) break;
  }
  if (!best) {
    // Cannot happen with the recipes above (an open floor always has an answer); a plain level all the same
    const floor = new Array<boolean>(9).fill(true);
    const want = new Array<number>(9).fill(0);
    want[5] = 3;
    best = { n, w: 3, h: 3, floor, want, start: 4, faces: FACES_3.slice(), par: 1 };
  }
  made.set(n, best);
  return best;
}
