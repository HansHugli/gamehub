import assert from "node:assert/strict";
import { test } from "node:test";
import { Lexicon, oneApart, puzzleBetween, randomPuzzle, step, unpack, validLadder } from "./game.ts";
import { PAIRS } from "./puzzles.ts";
import { COMMON, RARER } from "./words.ts";

const small = new Lexicon(["cold", "cord", "card", "ward", "warm", "word", "worm", "bold", "gold", "zzzz"]);

test("words are one apart when exactly one letter differs in place", () => {
  assert.equal(oneApart("cold", "cord"), true);
  assert.equal(oneApart("cold", "cold"), false);
  assert.equal(oneApart("cold", "card"), false);
  assert.equal(oneApart("cold", "dolc"), false);
  assert.deepEqual(unpack("coldwarm"), ["cold", "warm"]);
  assert.deepEqual(small.neighbours("cold").sort(), ["bold", "cord", "gold"]);
});

test("a shortest ladder is found, and none where the words do not join", () => {
  // Two ladders of four steps join these; either is right
  const way = small.path("cold", "warm")!;
  assert.equal(way.length - 1, 4);
  assert.equal(way[0], "cold");
  assert.equal(way[4], "warm");
  for (let i = 1; i < way.length; i++) assert.ok(small.has(way[i]!) && oneApart(way[i - 1]!, way[i]!));
  assert.deepEqual(small.path("cold", "cold"), ["cold"]);
  assert.equal(small.path("cold", "zzzz"), null);
  // From a word outside the set, the ladder first steps into it
  assert.deepEqual(new Lexicon(["cord", "card", "ward"]).path("cold", "ward"), ["cold", "cord", "card", "ward"]);
  assert.deepEqual(puzzleBetween(small, "cold", "warm"), { start: "cold", end: "warm", par: 4 });
  assert.equal(puzzleBetween(small, "cold", "zzzz"), null);
  assert.equal(puzzleBetween(small, "cold", "nope"), null);
});

test("a step must be a known word one letter from the top; an earlier word climbs back down", () => {
  const ladder = ["cold", "cord", "card"];
  assert.deepEqual(step(ladder, "ward", small), { ladder: ["cold", "cord", "card", "ward"], problem: "" });
  assert.equal(step(ladder, "carp", small).problem, "unknown");
  assert.equal(step(ladder, "warm", small).problem, "far");
  assert.equal(step(ladder, "card", small).problem, "same");
  assert.deepEqual(step(ladder, "cord", small), { ladder: ["cold", "cord"], problem: "" });
  const puzzle = { start: "cold", end: "warm", par: 4 };
  assert.equal(validLadder(puzzle, ladder, small), true);
  assert.equal(validLadder(puzzle, ["cord", "card"], small), false);
  assert.equal(validLadder(puzzle, ["cold", "card"], small), false);
  assert.equal(validLadder(puzzle, ["cold", "cord", "cold"], small), false);
  assert.equal(validLadder(puzzle, "cold", small), false);
});

test("the real word list: every hand-picked pair joins, and made-up puzzles are sound", () => {
  const common = new Lexicon(unpack(COMMON));
  const accepted = new Lexicon([...unpack(COMMON), ...unpack(RARER)]);
  assert.ok(common.words.size > 1500);
  assert.ok(accepted.words.size > common.words.size);
  for (const w of accepted.words) assert.match(w, /^[a-z]{4}$/);
  for (const [a, b] of PAIRS) {
    const p = puzzleBetween(common, a, b);
    assert.ok(p, `${a} to ${b} does not join`);
    assert.ok(p.par >= 3 && p.par <= 9, `${a} to ${b} takes ${p.par}`);
  }
  let seed = 7;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 200; i++) {
    const p = randomPuzzle(common, rng);
    assert.ok(p.par >= 3 && p.par <= 5);
    assert.equal(common.path(p.start, p.end)!.length - 1, p.par);
    assert.ok([...p.end].every((ch, k) => ch !== p.start[k]));
  }
});
