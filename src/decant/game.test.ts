import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOURS, DEPTH, SPARE, anyMove, canPour, complete, deal, done, pour, restore, run, solve, type Bottle } from "./game.ts";

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

test("a pour takes the top colour, onto the same colour or into an empty bottle", () => {
  const bottles: Bottle[] = [[1, 2, 2], [3, 2], [1, 1, 1, 3], [], [3, 3, 1, 2]];
  assert.equal(run([1, 2, 2]), 2);
  assert.equal(canPour(bottles, 0, 1), true);
  assert.equal(canPour(bottles, 0, 3), true);
  assert.equal(canPour(bottles, 0, 2), false, "a full bottle takes nothing");
  assert.equal(canPour(bottles, 1, 2), false);
  assert.equal(canPour(bottles, 3, 0), false, "an empty bottle has nothing to pour");
  assert.equal(canPour(bottles, 0, 0), false);
  assert.deepEqual(pour(bottles, 0, 1), { bottles: [[1], [3, 2, 2, 2], [1, 1, 1, 3], [], [3, 3, 1, 2]], moved: 2 });
  // Only as much as there is room for
  assert.deepEqual(pour([[2, 2, 2], [1, 1, 2]], 0, 1), { bottles: [[2, 2], [1, 1, 2, 2]], moved: 1 });
  assert.equal(pour(bottles, 1, 2).bottles, bottles);
  assert.equal(bottles[0]!.length, 3, "the bottles given are left as they were");
});

test("done means every bottle is empty or full of one colour", () => {
  assert.equal(complete([2, 2, 2, 2]), true);
  assert.equal(complete([2, 2, 2]), false);
  assert.equal(done([[1, 1, 1, 1], [], [2, 2, 2, 2]]), true);
  assert.equal(done([[1, 1, 1], [1], [2, 2, 2, 2]]), false);
  assert.equal(anyMove([[1, 2, 1, 2], [2, 1, 2, 1]]), false);
  assert.equal(anyMove([[1, 2, 1, 2], [2, 1, 2]]), true);
});

test("the solver finds a way that works, and says when there is none", () => {
  const start: Bottle[] = [[1, 2, 1, 2], [2, 1, 2, 1], [], []];
  const way = solve(start);
  assert.ok(Array.isArray(way));
  let bottles = start;
  for (const [from, to] of way) {
    assert.equal(canPour(bottles, from, to), true);
    bottles = pour(bottles, from, to).bottles;
  }
  assert.equal(done(bottles), true);
  assert.deepEqual(solve([[1, 1, 1, 1], []]), []);
  assert.equal(solve([[1, 2, 1, 2], [2, 1, 2, 1]]), null);
});

test("every puzzle dealt can be finished, at every size", () => {
  for (const colours of COLOURS) {
    for (let seed = 1; seed <= 4; seed++) {
      const bottles = deal(colours, seeded(seed * 17 + colours));
      assert.equal(bottles.length, colours + SPARE);
      assert.equal(bottles.filter((b) => b.length === 0).length, SPARE);
      assert.ok(bottles.every((b) => b.length === 0 || b.length === DEPTH));
      assert.ok(!bottles.some((b) => complete(b)));
      const way = solve(bottles);
      assert.ok(Array.isArray(way) && way.length > 0);
      let now = bottles;
      for (const [from, to] of way) now = pour(now, from, to).bottles;
      assert.equal(done(now), true);
      assert.deepEqual(restore(JSON.parse(JSON.stringify(bottles))), bottles);
    }
  }
});

test("saved bottles that are not a real puzzle are refused", () => {
  assert.equal(restore(null), null);
  assert.equal(restore([[1, 1, 1, 1], []]), null);
  const ok: Bottle[] = [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3], [4], []];
  assert.deepEqual(restore(ok), ok);
  assert.equal(restore([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3], [5], []]), null);
  assert.equal(restore([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3], [], []]), null);
  assert.equal(restore([[1, 2, 3, 4, 1], [2, 3, 4], [1, 2, 3, 4], [1, 2, 3], [4], []]), null);
});
