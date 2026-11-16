import assert from "node:assert/strict";
import { test } from "node:test";
import { DIRS, LETTERS, RECIPES, SIT_COUNT, TOP, UNDER, EAST, WEST, NORTH, SOUTH, begin, makeLevel, replay, roll, showing, solve, solved, tally, type Dir, type Level } from "./game.ts";

/** A bare 3 by 3 floor with a cube of six colours in the middle. */
function plain(want: number[] = new Array<number>(9).fill(0)): Level {
  return { n: 0, w: 3, h: 3, floor: new Array<boolean>(9).fill(true), want, start: 4, faces: [1, 2, 3, 4, 5, 6], par: 0 };
}
function run(level: Level, dirs: Dir[]) {
  let state = begin(level);
  for (const d of dirs) {
    const next = roll(level, state, d);
    assert.ok(next, "the roll is allowed");
    state = next;
  }
  return state;
}

test("a cube can sit 24 ways", () => {
  assert.equal(SIT_COUNT, 24);
});

test("the face rolled towards lands underneath and stamps the tile", () => {
  const level = plain();
  const places = [NORTH, EAST, SOUTH, WEST];
  for (const d of DIRS) {
    const before = showing(level, begin(level));
    const after = run(level, [d]);
    assert.equal(showing(level, after)[UNDER], before[places[d]!]);
    assert.equal(after.paint[after.at], before[places[d]!]);
    assert.equal(showing(level, after)[places[d]!], before[TOP], "the old top faces the way it rolled");
  }
});

test("rolling there and back puts the cube as it was", () => {
  const level = plain();
  assert.deepEqual(showing(level, run(level, [1, 3])), showing(level, begin(level)));
  assert.deepEqual(showing(level, run(level, [0, 2])), showing(level, begin(level)));
});

test("four rolls the same way bring every face back", () => {
  const level: Level = { ...plain(), w: 5, h: 1, floor: new Array<boolean>(5).fill(true), want: new Array<number>(5).fill(0), start: 0 };
  assert.deepEqual(showing(level, run(level, [1, 1, 1, 1])), showing(level, begin(level)));
});

test("a lap round four tiles turns the cube, and three laps turn it back", () => {
  const level = plain();
  const lap: Dir[] = [0, 1, 2, 3];
  const once = run(level, lap);
  assert.equal(once.at, 4);
  assert.notDeepEqual(showing(level, once), showing(level, begin(level)));
  assert.deepEqual(showing(level, run(level, [...lap, ...lap, ...lap])), showing(level, begin(level)));
});

test("the order of two rolls matters", () => {
  const level = plain();
  const a = showing(level, run(level, [1, 0]));
  const b = showing(level, run(level, [0, 1]));
  assert.notEqual(a[UNDER], b[UNDER]);
  assert.notEqual(a[EAST], b[EAST]);
  assert.notEqual(a[WEST], b[WEST]);
  assert.notEqual(a[SOUTH], b[SOUTH]);
});

test("the cube does not roll off the floor or into a hole", () => {
  const level = plain();
  level.floor[5] = false;
  assert.equal(roll(level, begin(level), 1), null);
  const corner = run(level, [0, 3]);
  assert.equal(roll(level, corner, 0), null);
  assert.equal(roll(level, corner, 3), null);
});

test("a later stamp goes over an earlier one", () => {
  const level = plain();
  const state = run(level, [1, 3, 1]);
  assert.equal(state.at, 5);
  assert.equal(state.paint[5], 5);
  const again = run(level, [1, 3, 0, 1, 2]);
  assert.equal(again.at, 5);
  assert.notEqual(again.paint[5], 5);
});

test("solved means every asking tile shows its colour, and the others do not matter", () => {
  const want = new Array<number>(9).fill(0);
  want[5] = 5;
  const level = plain(want);
  assert.equal(solved(level, begin(level)), false);
  assert.deepEqual(tally(level, begin(level)), { right: 0, asked: 1 });
  assert.equal(solved(level, run(level, [1])), true);
  assert.equal(solved(level, run(level, [1, 0])), true);
  assert.equal(solved(level, run(level, [1, 3, 0, 1, 2])), false);
});

test("the answer found is one that works and no shorter one exists for a simple case", () => {
  const want = new Array<number>(9).fill(0);
  want[5] = 6;
  const level = plain(want);
  // West's face (6) is the far side from the tile to the east, so one roll cannot do it.
  // Three cannot either: the cube has to go round a lap to bring that face under.
  const answer = solve(level, begin(level));
  assert.ok(answer);
  assert.equal(solved(level, run(level, answer)), true);
  assert.equal(answer.length, 5);
  assert.deepEqual(solve(level, run(level, answer)), []);
});

test("a saved run of rolls is replayed, and a run the level does not allow is refused", () => {
  const level = plain();
  assert.deepEqual(replay(level, "EN"), run(level, [1, 0]));
  assert.deepEqual(replay(level, ""), begin(level));
  assert.equal(replay(level, "EE"), null);
  assert.equal(replay(level, "EX"), null);
  assert.equal(LETTERS.length, 4);
});

test("every level has an answer of the length it says, and is the same each time it is made", () => {
  for (let n = 1; n <= RECIPES.length + 4; n++) {
    const level = makeLevel(n);
    const recipe = RECIPES[Math.min(n, RECIPES.length) - 1]!;
    assert.equal(level.floor[level.start], true, `level ${n} starts on a tile`);
    assert.equal(level.want.filter((c) => c !== 0).length, recipe.asking, `level ${n} asks for ${recipe.asking} tiles`);
    assert.ok(level.want.every((c, i) => c === 0 || level.floor[i]), `level ${n} asks only of tiles`);
    const answer = solve(level, begin(level));
    assert.ok(answer, `level ${n} has an answer`);
    assert.equal(answer.length, level.par, `level ${n} par`);
    assert.ok(level.par >= recipe.least && level.par <= recipe.most, `level ${n} par ${level.par} is in ${recipe.least} to ${recipe.most}`);
    assert.equal(solved(level, run(level, answer)), true, `level ${n} answer works`);
    assert.equal(makeLevel(n), level);
  }
});

test("a level can be solved from anywhere the player has got to", () => {
  const level = makeLevel(8);
  let state = begin(level);
  const wander: Dir[] = [0, 1, 2, 3, 1, 0, 3, 2, 2, 1];
  for (const d of wander) state = roll(level, state, d) ?? state;
  const answer = solve(level, state);
  assert.ok(answer);
  for (const d of answer) state = roll(level, state, d)!;
  assert.equal(solved(level, state), true);
});
