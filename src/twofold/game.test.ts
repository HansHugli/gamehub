import assert from "node:assert/strict";
import { test } from "node:test";
import { TARGET, canMove, highest, move, newGame, restore, spawn, type Game, type Tile } from "./game.ts";

/** A game from rows of numbers, 0 for a free cell. */
function board(rows: number[][], extra: Partial<Game> = {}): Game {
  const tiles: Tile[] = [];
  rows.forEach((r, row) => r.forEach((value, col) => { if (value) tiles.push({ id: tiles.length + 1, value, row, col }); }));
  return { tiles, score: 0, nextId: tiles.length + 1, reached: false, ...extra };
}
function rows(game: Game): number[][] {
  const out = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (const t of game.tiles) out[t.row]![t.col] = t.value;
  return out;
}

test("tiles slide to the edge and equal tiles that meet become one", () => {
  const r = move(board([[2, 0, 2, 0], [0, 4, 0, 8], [0, 0, 0, 0], [16, 16, 16, 16]]), "left");
  assert.deepEqual(rows(r.game), [[4, 0, 0, 0], [4, 8, 0, 0], [0, 0, 0, 0], [32, 32, 0, 0]]);
  assert.equal(r.gained, 4 + 32 + 32);
  assert.equal(r.game.score, 68);
  assert.equal(r.merged.length, 3);
  assert.equal(r.absorbed.length, 6);
});

test("a tile merges once per move, starting from the edge it slides to", () => {
  assert.deepEqual(rows(move(board([[2, 2, 2, 0], [4, 4, 8, 0], [2, 2, 4, 0], [0, 0, 0, 0]]), "left").game)[0], [4, 2, 0, 0]);
  assert.deepEqual(rows(move(board([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "right").game)[0], [0, 0, 2, 4]);
  // 4 4 8 does not chain into 16 in one move
  assert.deepEqual(rows(move(board([[4, 4, 8, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "left").game)[0], [8, 8, 0, 0]);
  assert.deepEqual(rows(move(board([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]]), "down").game).map((r) => r[0]), [0, 0, 4, 8]);
  assert.deepEqual(rows(move(board([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0]]), "up").game).map((r) => r[0]), [4, 8, 0, 0]);
});

test("a move that slides nothing changes nothing", () => {
  const g = board([[2, 4, 0, 0], [8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = move(g, "left");
  assert.equal(r.moved, false);
  assert.equal(r.game, g);
  assert.equal(move(g, "up").moved, false);
  assert.equal(move(g, "right").moved, true);
});

test("a new tile lands on a free cell, a 2 nine times in ten", () => {
  const g = board([[2, 4, 8, 16], [32, 64, 128, 256], [2, 4, 8, 16], [32, 64, 128, 0]]);
  const two = spawn(g, () => 0.5)!;
  assert.deepEqual({ row: two.tile.row, col: two.tile.col, value: two.tile.value }, { row: 3, col: 3, value: 2 });
  assert.equal(spawn(g, () => 0.95)!.tile.value, 4);
  assert.equal(spawn(two.game), null);
  const fresh = newGame(() => 0.3);
  assert.equal(fresh.tiles.length, 2);
  assert.equal(fresh.score, 0);
});

test("the game is over only when the board is full and no equal tiles touch", () => {
  assert.equal(canMove(board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]])), false);
  assert.equal(canMove(board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]])), true);
  assert.equal(canMove(board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 0]])), true);
  assert.equal(canMove(board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 8], [4, 2, 4, 8]])), true);
});

test("making the target is noticed once, and play goes on past it", () => {
  const r = move(board([[2048, 2048, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), "left");
  assert.equal(highest(r.game), TARGET);
  assert.equal(r.reachedNow, true);
  assert.equal(r.game.reached, true);
  const on = move(board([[4096, 4096, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { reached: true }), "right");
  assert.equal(highest(on.game), 8192);
  assert.equal(on.reachedNow, false);
});

test("a saved game comes back, and anything that is not a board is refused", () => {
  const g = board([[2, 0, 0, 0], [0, 4096, 0, 0], [0, 0, 0, 0], [0, 0, 0, 8]], { score: 120 });
  assert.deepEqual(restore(JSON.parse(JSON.stringify(g))), { ...g, reached: true });
  assert.equal(restore(null), null);
  assert.equal(restore({ tiles: [], score: 0, nextId: 1 }), null);
  assert.equal(restore({ tiles: [{ id: 1, value: 3, row: 0, col: 0 }], score: 0, nextId: 2 }), null);
  assert.equal(restore({ tiles: [{ id: 1, value: 2, row: 0, col: 4 }], score: 0, nextId: 2 }), null);
  assert.equal(restore({ tiles: [{ id: 1, value: 2, row: 0, col: 0 }, { id: 2, value: 2, row: 0, col: 0 }], score: 0, nextId: 3 }), null);
});
