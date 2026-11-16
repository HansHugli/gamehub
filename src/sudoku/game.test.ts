import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVELS, conflicts, countSolutions, deduce, fitsPuzzle, layout, makePuzzle, restorePuzzle, sizeOf, solvable, solved, solvedGrid, tints } from "./game.ts";

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
/** A full 6 by 6 grid that keeps the rules: 123456 / 456123 / 234561 / 561234 / 345612 / 612345. */
const SIX = Array.from({ length: 36 }, (_, i) => ((Math.floor(i / 6) * 3 + Math.floor(i / 12) + (i % 6)) % 6) + 1);
const without = (grid: number[], ...cells: number[]): number[] => grid.map((v, i) => (cells.includes(i) ? 0 : v));

test("the grid is cut into rows, columns and boxes", () => {
  const six = layout(6);
  assert.deepEqual([six.boxRows, six.boxCols, six.units.length], [2, 3, 18]);
  assert.deepEqual(six.units[12], [0, 1, 2, 6, 7, 8], "the first box is two rows of three");
  assert.equal(six.peers[0]!.length, 5 + 5 + 2);
  const nine = layout(9);
  assert.deepEqual(nine.units[18], [0, 1, 2, 9, 10, 11, 18, 19, 20]);
  assert.equal(nine.peers[40]!.length, 20);
  assert.ok(nine.units.every((u) => u.length === 9));
});

test("a full grid at random keeps every rule", () => {
  for (const n of [6, 9]) {
    const g = solvedGrid(n, seeded(n));
    assert.equal(solved(g, tints(g), n), true);
  }
  assert.equal(solved(SIX, tints(SIX), 6), true);
});

test("the tints settle what the numbers alone leave open", () => {
  // 1 and 4 sit at the corners of a rectangle, so without tints they could swap
  const open = without(SIX, 0, 3, 6, 9);
  assert.equal(countSolutions(open, null, 6), 2);
  assert.equal(countSolutions(open, tints(SIX), 6), 1);
  assert.equal(solvable(open, tints(SIX), 6, false), true);
});

test("a square is worked out from its box, row or column, or from being the only number left", () => {
  const even = tints(SIX);
  assert.deepEqual(deduce(without(SIX, 7), even, 6), { index: 7, value: 5, reason: "box" });
  assert.equal(deduce(SIX, even, 6), null, "nothing left to find");
  // Two 2s in a row: the grid cannot be finished, so nothing is offered
  const broken = without(SIX, 7);
  broken[2] = 2;
  assert.equal(deduce(broken, even, 6), null);
});

test("rule breaks are found: a wrong tint, and the same number twice", () => {
  const even = tints(SIX);
  const tint = without(SIX, 0, 1);
  tint[0] = 6;
  assert.deepEqual(conflicts(tint, even, 6), { cells: new Set([0, 5, 8, 30]), rule: "plain" }, "an even number on a plain square, and the 6s it now doubles");
  tint[0] = 0;
  tint[1] = 1;
  assert.equal(conflicts(tint, even, 6).rule, "tint");
  const twice = without(SIX, 0);
  twice[0] = 3;
  const found = conflicts(twice, even, 6);
  assert.equal(found.rule, "row");
  assert.deepEqual([...found.cells].sort((a, b) => a - b), [0, 2, 24]);
  assert.equal(solved(twice, even, 6), false);
  assert.equal(solved(without(SIX, 0), even, 6), false, "not finished");
});

test("every level makes a puzzle with one answer that can be worked out as promised", () => {
  for (const level of LEVELS) {
    for (const seed of [1, 2, 3]) {
      const started = performance.now();
      const p = makePuzzle(level, seeded(seed));
      const took = performance.now() - started;
      const n = sizeOf(level);
      const even = tints(p.solution);
      const given = p.givens.filter((v) => v !== 0).length;
      console.log(`${level} ${seed}: ${given} given, ${Math.round(took)} ms`);
      assert.equal(countSolutions(p.givens, even, n), 1);
      assert.equal(solvable(p.givens, even, n, level === "tricky"), true);
      assert.ok(given < n * n * 0.4, "the tints stand in for most of the numbers");
      assert.ok(took < 3000, "made quickly enough to wait for");
      // Following the steps one at a time reaches the answer
      const g = p.givens.slice();
      for (let d = deduce(g, even, n); d; d = deduce(g, even, n)) {
        assert.equal(d.value, p.solution[d.index]);
        g[d.index] = d.value;
      }
      assert.deepEqual(g, p.solution);
      assert.deepEqual(restorePuzzle(JSON.parse(JSON.stringify(p))), p);
      assert.equal(fitsPuzzle(p, p.givens), true);
    }
  }
});

test("a saved puzzle that is not a real one is refused", () => {
  const p = makePuzzle("small", seeded(9));
  assert.equal(restorePuzzle(null), null);
  assert.equal(restorePuzzle({ ...p, level: "huge" }), null);
  assert.equal(restorePuzzle({ ...p, solution: p.solution.slice(1) }), null);
  const swapped = p.solution.slice();
  [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
  assert.equal(restorePuzzle({ ...p, solution: swapped, givens: swapped.map(() => 0) }), null, "an answer that breaks the rules");
  const blank = p.givens.findIndex((v) => v === 0);
  const lie = p.givens.slice();
  lie[blank] = (p.solution[blank]! % 6) + 1;
  assert.equal(restorePuzzle({ ...p, givens: lie }), null, "a given that is not in the answer");
  assert.equal(fitsPuzzle(p, p.givens.map(() => 0)), false, "a given rubbed out");
  assert.equal(fitsPuzzle(p, p.solution), true);
});
