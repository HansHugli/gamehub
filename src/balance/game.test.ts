import assert from "node:assert/strict";
import { test } from "node:test";
import { SIZES, conflicts, deduce, finished, fitsPuzzle, full, makePuzzle, reason, restorePuzzle, solved } from "./game.ts";

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
/** A grid from rows written with o (circle), x (square) and . (empty). */
const grid = (rows: string[]): number[] => rows.join("").split("").map((ch) => (ch === "o" ? 1 : ch === "x" ? 2 : 0));

test("a broken rule is found: three alike, too many of one, two lines the same", () => {
  assert.equal(conflicts(grid(["oo..", "....", "....", "...."]), 4).rule, "");
  const three = conflicts(grid(["ooo.", "....", "....", "...."]), 4);
  assert.equal(three.rule, "three");
  assert.deepEqual([...three.cells].sort(), [0, 1, 2]);
  const count = conflicts(grid(["o.oo", "....", "....", "...."]), 4);
  assert.equal(count.rule, "count");
  assert.equal(count.line, "row");
  const down = conflicts(grid(["o...", "x...", "o...", "o..."]), 4);
  assert.deepEqual([down.rule, down.line], ["count", "column"]);
  const same = conflicts(grid(["oxox", "....", "oxox", "...."]), 4);
  assert.equal(same.rule, "same");
  assert.equal(same.cells.size, 8);
  assert.equal(solved(grid(["oxox", "xoxo", "oxxo", "xoox"]), 4), true);
  assert.equal(solved(grid(["oxox", "xoxo", "oxxo", "xoo."]), 4), false);
});

test("each kind of reasoning gives the cell it should", () => {
  assert.deepEqual(deduce(grid(["oo..", "....", "....", "...."]), 4), { index: 2, value: 2, reason: "pair", line: "row" });
  assert.deepEqual(deduce(grid(["....", ".x..", "....", ".x.."]), 4), { index: 9, value: 1, reason: "between", line: "column" });
  assert.deepEqual(deduce(grid(["o..o..", "......", "......", "......", "......", "......"]), 6), null);
  assert.deepEqual(deduce(grid(["oox.o.", "......", "......", "......", "......", "......"]), 6, false), { index: 3, value: 2, reason: "full", line: "row" });
  // Row 0 is finished; row 3 agrees with it so far, so its last two cells go the other way round
  const twin = deduce(grid(["oxxoxo", "......", "......", "oxxo..", "......", "......"]), 6, false);
  assert.deepEqual(twin, { index: 22, value: 1, reason: "twin", line: "row" });
});

test("a finished grid keeps every rule, at every size", () => {
  for (const size of SIZES) {
    for (let seed = 1; seed <= 5; seed++) {
      const g = finished(size, seeded(seed * size));
      assert.equal(g.length, size * size);
      assert.equal(solved(g, size), true);
    }
  }
});

test("a puzzle can be finished by reasoning alone, and only to its own answer", () => {
  for (const size of SIZES) {
    for (let seed = 1; seed <= 3; seed++) {
      const p = makePuzzle(size, seeded(seed * 31 + size));
      const empty = p.givens.filter((v) => v === 0).length;
      assert.ok(empty > (size * size) / 3, `${size}: only ${empty} cells to fill`);
      assert.ok(p.givens.every((v, i) => v === 0 || v === p.solution[i]));
      assert.deepEqual(reason(p.givens, size), p.solution);
      // Each step of reasoning is true of the answer, so a hint never misleads
      const g = p.givens.slice();
      for (let d = deduce(g, size); d; d = deduce(g, size)) {
        assert.equal(d.value, p.solution[d.index]);
        g[d.index] = d.value;
      }
      assert.equal(full(g), true);
    }
  }
});

test("a saved puzzle comes back, and anything else is refused", () => {
  const p = makePuzzle(6, seeded(9));
  assert.deepEqual(restorePuzzle(JSON.parse(JSON.stringify(p))), p);
  assert.equal(restorePuzzle(null), null);
  assert.equal(restorePuzzle({ ...p, size: 7 }), null);
  assert.equal(restorePuzzle({ ...p, solution: p.solution.map(() => 1) }), null);
  assert.equal(restorePuzzle({ ...p, givens: p.solution.map((v) => 3 - v) }), null);
  assert.equal(fitsPuzzle(p, p.givens), true);
  assert.equal(fitsPuzzle(p, p.solution), true);
  assert.equal(fitsPuzzle(p, p.givens.map((v) => (v ? 3 - v : 0))), false);
  assert.equal(fitsPuzzle(p, [1, 2]), false);
});
