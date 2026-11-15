import { lockPage, stored } from "../shell.ts";
import { SIZES, conflicts, deduce, fitsPuzzle, makePuzzle, restorePuzzle, solved, type Deduction, type Grid, type Puzzle } from "./game.ts";

const SAVE_KEY = "gamehub.balance.game.v1";
const TALLY_KEY = "gamehub.balance.tally.v1";
const NAMES = ["", "circle", "square"];

/** A puzzle under way: the grid as it stands, the taps that can be undone, and the help taken. */
interface Play {
  puzzle: Puzzle;
  grid: Grid;
  /** Each change as the cell and what it held before. */
  undo: [number, number][];
  shown: number;
  /** The solve has been counted. */
  counted: boolean;
}
interface Tally {
  solved: number;
  unaided: number;
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}
const climbEl = el("climb");
const boardEl = el("board");
const statusEl = el("status");
const toolsEl = el("tools");
const afterEl = el("after");
const undoButton = el<HTMLButtonElement>("undo");
const hintButton = el<HTMLButtonElement>("hint");
const newButton = el<HTMLButtonElement>("new");
const chooserEl = el("chooser");
const chooserText = el("chooser-text");
const restartButton = el<HTMLButtonElement>("restart");
const rulebookEl = el("rulebook");

lockPage();

function read(key: string): unknown {
  try {
    return JSON.parse(stored.get(key) ?? "null");
  } catch {
    return null;
  }
}
function readTally(): Tally {
  const t = read(TALLY_KEY) as Partial<Tally> | null;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return t && whole(t.solved) && whole(t.unaided) ? { solved: t.solved, unaided: t.unaided } : { solved: 0, unaided: 0 };
}
function readPlay(): Play | null {
  const p = read(SAVE_KEY) as Partial<Play> | null;
  if (!p) return null;
  const puzzle = restorePuzzle(p.puzzle);
  if (!puzzle || !fitsPuzzle(puzzle, p.grid)) return null;
  const undo = Array.isArray(p.undo) ? p.undo.filter((u): u is [number, number] => Array.isArray(u) && Number.isInteger(u[0]) && u[0] >= 0 && u[0] < p.grid!.length && puzzle.givens[u[0]] === 0 && (u[1] === 0 || u[1] === 1 || u[1] === 2)) : [];
  return { puzzle, grid: p.grid, undo: undo.slice(-400), shown: typeof p.shown === "number" && p.shown >= 0 ? Math.floor(p.shown) : 0, counted: p.counted === true };
}
function fresh(size: number): Play {
  const puzzle = makePuzzle(size);
  return { puzzle, grid: puzzle.givens.slice(), undo: [], shown: 0, counted: false };
}

const tally = readTally();
let play: Play = readPlay() ?? fresh(SIZES[0]);
let note: { text: string; kind: "" | "good" | "bad" } = { text: "", kind: "" };
let cells: HTMLButtonElement[] = [];

function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(play));
  stored.set(TALLY_KEY, JSON.stringify(tally));
}
function isSolved(): boolean {
  return solved(play.grid, play.puzzle.size);
}
function count(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}
function modalOpen(): boolean {
  return !chooserEl.hidden || !rulebookEl.hidden;
}

// ---- drawing ----

/** Build the grid of cells for this puzzle's size. */
function build(): void {
  const { size, givens } = play.puzzle;
  boardEl.textContent = "";
  boardEl.style.setProperty("--n", String(size));
  cells = givens.map((given, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    if (given) cell.disabled = true;
    else cell.addEventListener("click", () => tap(i));
    boardEl.append(cell);
    return cell;
  });
  fit();
}
function draw(shown = -1): void {
  const { size, givens } = play.puzzle;
  const done = isSolved();
  const bad = conflicts(play.grid, size);
  cells.forEach((cell, i) => {
    const v = play.grid[i]!;
    cell.className = "cell" + (v ? " v" + v : "") + (givens[i] ? " given" : "") + (bad.cells.has(i) ? " wrong" : "") + (i === shown ? " shown" : "");
    cell.setAttribute("aria-label", `Row ${Math.floor(i / size) + 1}, column ${(i % size) + 1}: ${v ? NAMES[v] : "empty"}${givens[i] ? ", given" : ""}`);
  });
  boardEl.classList.toggle("done", done);
  toolsEl.hidden = done;
  afterEl.hidden = !done;
  undoButton.disabled = play.undo.length === 0;
  newButton.classList.toggle("ready", done);
  const left = play.grid.filter((v) => v === 0).length;
  if (done) {
    statusEl.className = "status good";
    statusEl.textContent = `Solved${play.shown ? ` with ${count(play.shown, "step")} shown` : ", all your own work"}. ${count(tally.solved, "puzzle")} solved, ${tally.unaided} without help.`;
  } else if (note.text) {
    statusEl.className = "status" + (note.kind ? " " + note.kind : "");
    statusEl.textContent = note.text;
  } else if (bad.rule) {
    statusEl.className = "status bad";
    statusEl.textContent = bad.rule === "three" ? `Three alike in a ${bad.line}.` : bad.rule === "count" ? `A ${bad.line} has too many of one kind: it takes ${size / 2} of each.` : `Two ${bad.line}s are the same.`;
  } else {
    statusEl.className = "status";
    statusEl.textContent = play.undo.length === 0 && left === play.puzzle.givens.filter((v) => v === 0).length ? "Tap a cell: circle, square, empty. Never three alike in a line, and as many circles as squares in every row and column." : `${count(left, "cell")} to go.`;
  }
}

/** Fit the grid to the room above the buttons, on any screen and either way up. */
function fit(): void {
  const room = climbEl.getBoundingClientRect();
  boardEl.style.setProperty("--size", `${Math.floor(Math.max(150, Math.min(560, room.width, room.height)))}px`);
}

// ---- playing ----

function finishIfSolved(): void {
  if (!isSolved() || play.counted) return;
  play.counted = true;
  tally.solved++;
  if (play.shown === 0) tally.unaided++;
}
function set(i: number, value: number): void {
  play.undo.push([i, play.grid[i]!]);
  if (play.undo.length > 400) play.undo.shift();
  play.grid[i] = value;
}

function tap(i: number): void {
  if (modalOpen() || isSolved() || play.puzzle.givens[i]) return;
  set(i, (play.grid[i]! + 1) % 3);
  note = { text: "", kind: "" };
  finishIfSolved();
  save();
  draw();
}

function undo(): void {
  if (modalOpen() || isSolved()) return;
  const last = play.undo.pop();
  if (!last) return;
  play.grid[last[0]] = last[1];
  note = { text: "", kind: "" };
  save();
  draw();
}

function explain(d: Deduction): string {
  const is = NAMES[d.value]!;
  const not = NAMES[3 - d.value]!;
  switch (d.reason) {
    case "pair": return `Two ${not}s side by side in this ${d.line}, so the cell next to them is a ${is}.`;
    case "between": return `This cell sits between two ${not}s in its ${d.line}, so it is a ${is}.`;
    case "full": return `This ${d.line} already has all its ${not}s, so what is left are ${is}s.`;
    case "twin": return `With a ${not} here this ${d.line} would match another one exactly, so it is a ${is}.`;
    case "trial": return `A ${not} here would soon break a rule nearby, so it is a ${is}.`;
  }
}

/** Show one step: first a cell that is wrong, otherwise the next cell that can be worked out. */
function showStep(): void {
  if (modalOpen() || isSolved()) return;
  const { size, solution } = play.puzzle;
  const wrong = play.grid.findIndex((v, i) => v !== 0 && v !== solution[i]);
  if (wrong >= 0) {
    set(wrong, 0);
    play.shown++;
    note = { text: "That cell was not right, so I cleared it.", kind: "" };
    save();
    return draw(wrong);
  }
  const d = deduce(play.grid, size) ?? (() => {
    const i = play.grid.findIndex((v) => v === 0);
    return i < 0 ? null : ({ index: i, value: solution[i]!, reason: "trial", line: "row" } satisfies Deduction);
  })();
  if (!d) return;
  set(d.index, d.value);
  play.shown++;
  note = { text: explain(d), kind: "" };
  finishIfSolved();
  save();
  draw(d.index);
}

function start(size: number): void {
  play = fresh(size);
  note = { text: "", kind: "" };
  save();
  build();
  draw();
}

undoButton.addEventListener("click", undo);
hintButton.addEventListener("click", showStep);
el<HTMLButtonElement>("next").addEventListener("click", () => start(play.puzzle.size));
el<HTMLButtonElement>("rules").addEventListener("click", () => {
  rulebookEl.hidden = false;
  el<HTMLButtonElement>("rules-close").focus();
});
el<HTMLButtonElement>("rules-close").addEventListener("click", () => {
  rulebookEl.hidden = true;
});

// The only way to drop a puzzle is the button in the top bar, and it always asks what you want
newButton.addEventListener("click", () => {
  const touched = play.grid.some((v, i) => v !== play.puzzle.givens[i]);
  const under = touched && !isSolved();
  chooserText.textContent = under ? "Choosing a size leaves the puzzle you are on. It will not come back." : "Choose a size.";
  restartButton.hidden = !under;
  chooserEl.hidden = false;
});
el<HTMLButtonElement>("chooser-no").addEventListener("click", () => {
  chooserEl.hidden = true;
});
restartButton.addEventListener("click", () => {
  chooserEl.hidden = true;
  play = { ...play, grid: play.puzzle.givens.slice(), undo: [] };
  note = { text: "", kind: "" };
  save();
  draw();
});
for (const button of chooserEl.querySelectorAll<HTMLButtonElement>("[data-size]")) {
  button.addEventListener("click", () => {
    chooserEl.hidden = true;
    start(Number(button.dataset.size));
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  chooserEl.hidden = true;
  rulebookEl.hidden = true;
});
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", fit);
if ("ResizeObserver" in window) new ResizeObserver(fit).observe(climbEl);

finishIfSolved();
save();
build();
draw();
