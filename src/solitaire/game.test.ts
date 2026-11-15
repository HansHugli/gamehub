import assert from "node:assert/strict";
import { test } from "node:test";
import { bestMove, canFinish, deal, finishStep, fitsColumn, fitsFoundation, hint, isRed, legal, play, rankOf, restore, suitOf, turn, won, type Card, type Game } from "./game.ts";

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
/** A card from words like "KS" or "10H": spades, hearts, diamonds, clubs. */
function card(name: string): Card {
  const suit = "SHDC".indexOf(name.slice(-1));
  const rank = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(name.slice(0, -1)) + 1;
  assert.ok(suit >= 0 && rank >= 1, name);
  return suit * 13 + rank - 1;
}
const cards = (names: string): Card[] => (names ? names.split(" ").map(card) : []);
function game(parts: { stock?: string; waste?: string; foundations?: string[]; columns?: [string, string][]; draw?: 1 | 3 }): Game {
  const columns = Array.from({ length: 7 }, (_, i) => ({ down: cards(parts.columns?.[i]?.[0] ?? ""), up: cards(parts.columns?.[i]?.[1] ?? "") }));
  return { stock: cards(parts.stock ?? ""), waste: cards(parts.waste ?? ""), foundations: [0, 1, 2, 3].map((s) => cards(parts.foundations?.[s] ?? "")), columns, draw: parts.draw ?? 1, moves: 0 };
}

test("cards have a suit, a rank and a colour", () => {
  assert.deepEqual([suitOf(card("AS")), rankOf(card("AS")), isRed(card("AS"))], [0, 1, false]);
  assert.deepEqual([suitOf(card("KH")), rankOf(card("KH")), isRed(card("KH"))], [1, 13, true]);
  assert.equal(isRed(card("5D")), true);
  assert.equal(isRed(card("5C")), false);
});

test("a deal lays out seven columns with one card up on each, and the rest in the stock", () => {
  const g = deal(seeded(3), 3);
  assert.deepEqual(g.columns.map((c) => c.down.length), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(g.columns.every((c) => c.up.length === 1));
  assert.equal(g.stock.length, 24);
  assert.equal(g.draw, 3);
  assert.equal(new Set([...g.stock, ...g.columns.flatMap((c) => [...c.down, ...c.up])]).size, 52);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(g))), g);
});

test("columns build down in alternating colours, and only a king starts an empty one", () => {
  const g = game({ columns: [["", "8S"], ["", "7H"], ["", "7C"], ["", "KD"], ["", ""], ["2C", "9H"]] });
  assert.equal(fitsColumn(g, card("7H"), 0), true);
  assert.equal(fitsColumn(g, card("7C"), 0), false, "same colour");
  assert.equal(fitsColumn(g, card("6H"), 0), false, "not the next rank");
  assert.equal(fitsColumn(g, card("KD"), 4), true);
  assert.equal(fitsColumn(g, card("7H"), 4), false);
  const moved = play(g, { from: { pile: "column", col: 1 }, to: { pile: "column", col: 0 }, count: 1 })!;
  assert.deepEqual(moved.columns[0]!.up, cards("8S 7H"));
  assert.deepEqual(moved.columns[1]!.up, []);
  assert.equal(moved.moves, 1);
  assert.equal(g.columns[0]!.up.length, 1, "the game given is left as it was");
  // Several cards go together, and the card they uncover is turned up
  const run = game({ columns: [["", "9D"], ["4C", "8S 7H"]] });
  const after = play(run, { from: { pile: "column", col: 1 }, to: { pile: "column", col: 0 }, count: 2 })!;
  assert.deepEqual(after.columns[0]!.up, cards("9D 8S 7H"));
  assert.deepEqual(after.columns[1], { down: [], up: cards("4C") });
  assert.equal(play(run, { from: { pile: "column", col: 1 }, to: { pile: "column", col: 0 }, count: 1 }), null, "7H alone does not go on 9D");
  assert.equal(legal(run, { from: { pile: "column", col: 1 }, to: { pile: "column", col: 1 }, count: 1 }), false);
});

test("foundations build up by suit from the ace", () => {
  const g = game({ waste: "2S", foundations: ["AS", "", "", ""], columns: [["", "AH"], ["", "3S"]] });
  assert.equal(fitsFoundation(g, card("2S")), true);
  assert.equal(fitsFoundation(g, card("3S")), false);
  assert.equal(fitsFoundation(g, card("AH")), true);
  const a = play(g, { from: { pile: "waste" }, to: { pile: "foundation", suit: 0 }, count: 1 })!;
  assert.deepEqual(a.foundations[0], cards("AS 2S"));
  assert.equal(legal(g, { from: { pile: "waste" }, to: { pile: "foundation", suit: 1 }, count: 1 }), false, "the wrong suit's pile");
  // A card can come back down from a foundation onto a column
  const back = game({ foundations: ["AS 2S", "", "", ""], columns: [["", "3H"]] });
  assert.deepEqual(play(back, { from: { pile: "foundation", suit: 0 }, to: { pile: "column", col: 0 }, count: 1 })!.columns[0]!.up, cards("3H 2S"));
});

test("the stock turns one or three, and turns back over when it runs out", () => {
  const one = turn(game({ stock: "2C 3C 4C" }))!;
  assert.deepEqual([one.stock, one.waste], [cards("2C 3C"), cards("4C")]);
  const three = turn(game({ stock: "2C 3C 4C 5C", waste: "9H", draw: 3 }))!;
  assert.deepEqual([three.stock, three.waste], [cards("2C"), cards("9H 5C 4C 3C")]);
  const last = turn(three)!;
  assert.deepEqual([last.stock, last.waste], [[], cards("9H 5C 4C 3C 2C")]);
  const over = turn(last)!;
  assert.deepEqual([over.stock, over.waste], [cards("2C 3C 4C 5C 9H"), []]);
  assert.deepEqual(turn(over)!.waste, cards("9H 5C 4C"), "the same cards come round in the same order");
  assert.equal(turn(game({})), null);
});

test("a tapped card goes to its foundation first, then onto a card before an empty column", () => {
  const g = game({ waste: "AS", columns: [["", "KH"], ["", ""], ["", "QS"], ["3D", "JH"]] });
  assert.deepEqual(bestMove(g, { pile: "waste" }, 1)!.to, { pile: "foundation", suit: 0 });
  assert.deepEqual(bestMove(g, { pile: "column", col: 3 }, 1)!.to, { pile: "column", col: 2 });
  assert.equal(bestMove(g, { pile: "column", col: 0 }, 1), null, "a king with nothing under it stays put");
  assert.equal(bestMove(g, { pile: "column", col: 2 }, 1)!.to.pile, "column");
  assert.deepEqual(hint(g), { kind: "move", move: { from: { pile: "column", col: 3 }, to: { pile: "column", col: 2 }, count: 1 } });
  assert.deepEqual(hint(game({ stock: "5C", columns: [["", "KH"]] })), { kind: "turn" });
  assert.deepEqual(hint(game({ waste: "5C", columns: [["", "KH"]] })), { kind: "none" });
});

test("a game with every card in sight plays itself out to a win", () => {
  let g = game({ stock: "QC", waste: "KC", foundations: ["AS 2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS", "AH 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH", "AD 2D 3D 4D 5D 6D 7D 8D 9D 10D JD QD KD", "AC 2C 3C 4C 5C 6C 7C 8C 9C"], columns: [["", "JC"], ["", "10C"]] });
  assert.equal(canFinish(g), true);
  assert.equal(canFinish({ ...g, draw: 3 }), false, "with three at a time the stock may hide a card");
  for (let i = 0; i < 20 && !won(g); i++) g = finishStep(g)!;
  assert.equal(won(g), true);
  assert.equal(canFinish(g), false);
  assert.equal(canFinish(deal(seeded(1))), false);
});

test("a saved game that is not a real one is refused", () => {
  const g = deal(seeded(5));
  assert.equal(restore(null), null);
  assert.equal(restore({ ...g, stock: g.stock.slice(1) }), null, "a card missing");
  assert.equal(restore({ ...g, stock: [...g.stock.slice(1), g.stock[1]] }), null, "a card twice");
  const swapped = JSON.parse(JSON.stringify(g)) as Game;
  swapped.columns[1] = { down: [], up: [swapped.columns[1]!.down[0]!, swapped.columns[1]!.up[0]!] };
  const pair = swapped.columns[1].up;
  const fine = isRed(pair[0]!) !== isRed(pair[1]!) && rankOf(pair[1]!) === rankOf(pair[0]!) - 1;
  assert.equal(restore(swapped) === null, !fine, "face-up cards must run down in alternating colours");
});
