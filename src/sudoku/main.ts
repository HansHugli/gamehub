import { lockPage, stored } from "../shell.ts";
import { LEVELS, allowed, conflicts, deduce, fitsPuzzle, layout, makePuzzle, restorePuzzle, sizeOf, solved, tints, type Deduction, type Level, type Puzzle } from "./game.ts";

const SAVE_KEY = "gamehub.sudoku.game.v1";
const TALLY_KEY = "gamehub.sudoku.tally.v1";

/** One square as it was before a change: where, its number, its notes. */
type Change = [number, number, number];
/** A puzzle under way. Notes are kept per square as a set of bits. */
interface Play {
  puzzle: Puzzle;
  grid: number[];
  notes: number[];
  /** Each thing done, as the squares it changed. */
  undo: Change[][];
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
const padEl = el("pad");
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
function whole(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
function readTally(): Tally {
  const t = read(TALLY_KEY) as Partial<Tally> | null;
  return t && whole(t.solved) && whole(t.unaided) ? { solved: t.solved, unaided: t.unaided } : { solved: 0, unaided: 0 };
}
function readPlay(): Play | null {
  const p = read(SAVE_KEY) as Partial<Play> | null;
  if (!p) return null;
  const puzzle = restorePuzzle(p.puzzle);
  if (!puzzle || !fitsPuzzle(puzzle, p.grid)) return null;
  const n = sizeOf(puzzle.level);
  const cells = n * n;
  const noteSet = (v: unknown): v is number => whole(v) && v < 2 << n;
  const notes = Array.isArray(p.notes) && p.notes.length === cells && p.notes.every(noteSet) ? p.notes : new Array<number>(cells).fill(0);
  const change = (c: unknown): c is Change => Array.isArray(c) && c.length === 3 && whole(c[0]) && c[0] < cells && puzzle.givens[c[0]] === 0 && whole(c[1]) && c[1] <= n && noteSet(c[2]);
  const undo = Array.isArray(p.undo) && p.undo.every((step) => Array.isArray(step) && step.every(change)) ? p.undo.slice(-400) : [];
  return { puzzle, grid: p.grid, notes, undo, shown: whole(p.shown) ? p.shown : 0, counted: p.counted === true };
}
function fresh(level: Level): Play {
  const puzzle = makePuzzle(level);
  return { puzzle, grid: puzzle.givens.slice(), notes: puzzle.givens.map(() => 0), undo: [], shown: 0, counted: false };
}

const tally = readTally();
let play: Play = readPlay() ?? fresh("gentle");
let n = sizeOf(play.puzzle.level);
let even = tints(play.puzzle.solution);
let selected = -1;
let noting = false;
let note: { text: string; kind: "" | "good" | "bad" } = { text: "", kind: "" };
let squares: HTMLButtonElement[] = [];
let keys: HTMLButtonElement[] = [];
let notesKey: HTMLButtonElement | null = null;

function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(play));
  stored.set(TALLY_KEY, JSON.stringify(tally));
}
function isSolved(): boolean {
  return solved(play.grid, even, n);
}
function count(k: number, one: string): string {
  return `${k} ${one}${k === 1 ? "" : "s"}`;
}
function modalOpen(): boolean {
  return !chooserEl.hidden || !rulebookEl.hidden;
}
function say(text = "", kind: "" | "good" | "bad" = ""): void {
  note = { text, kind };
}

// ---- drawing ----

function key(label: string, extra: string, press: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "key" + extra;
  button.textContent = label;
  button.addEventListener("click", press);
  padEl.append(button);
  return button;
}
/** Build the squares and the number keys for this puzzle's size. */
function build(): void {
  const L = layout(n);
  boardEl.textContent = "";
  boardEl.style.setProperty("--n", String(n));
  squares = play.puzzle.givens.map((_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const square = document.createElement("button");
    square.type = "button";
    square.dataset.edges = (c % L.boxCols === L.boxCols - 1 && c < n - 1 ? " edge-r" : "") + (r % L.boxRows === L.boxRows - 1 && r < n - 1 ? " edge-b" : "");
    square.addEventListener("click", () => select(i));
    boardEl.append(square);
    return square;
  });
  padEl.textContent = "";
  padEl.style.setProperty("--cols", n === 9 ? "6" : "4");
  keys = Array.from({ length: n }, (_, k) => key(String(k + 1), (k + 1) % 2 === 0 ? " even" : "", () => enter(k + 1)));
  notesKey = key("Notes", " word" + (n === 9 ? " wide" : ""), toggleNotes);
  key("Erase", " word", erase);
  fit();
}
function fill(square: HTMLButtonElement, value: number, notes: number): void {
  const wanted = `${value}:${notes}`;
  if (square.dataset.holds === wanted) return;
  square.dataset.holds = wanted;
  square.textContent = "";
  if (value) {
    const digit = document.createElement("span");
    digit.className = "digit";
    digit.textContent = String(value);
    square.append(digit);
  } else if (notes) {
    const small = document.createElement("span");
    small.className = "notes";
    for (let v = 1; v <= n; v++) {
      const one = document.createElement("span");
      one.textContent = notes & (1 << v) ? String(v) : "";
      small.append(one);
    }
    square.append(small);
  }
}
function draw(shown = -1): void {
  const { givens } = play.puzzle;
  const done = isSolved();
  const bad = conflicts(play.grid, even, n);
  const peers = new Set(selected >= 0 && !done ? layout(n).peers[selected] : []);
  const alike = selected >= 0 && !done ? play.grid[selected]! : 0;
  squares.forEach((square, i) => {
    const v = play.grid[i]!;
    square.className = "sq" + square.dataset.edges + (even[i] ? " even" : "") + (givens[i] ? " given" : "") + (bad.cells.has(i) ? " wrong" : "") + (peers.has(i) ? " peer" : "") + (v && v === alike ? " same" : "") + (i === selected && !done ? " sel" : "") + (i === shown ? " shown" : "");
    fill(square, v, play.notes[i]!);
    square.setAttribute("aria-label", `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}, ${even[i] ? "tinted" : "plain"}: ${v || "empty"}${givens[i] ? ", given" : ""}`);
  });
  keys.forEach((button, k) => button.classList.toggle("full", play.grid.filter((v) => v === k + 1).length >= n));
  notesKey?.classList.toggle("on", noting);
  notesKey?.setAttribute("aria-pressed", String(noting));
  boardEl.classList.toggle("done", done);
  padEl.hidden = done;
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
    statusEl.textContent = bad.rule === "tint" ? "A tinted square holds an even number." : bad.rule === "plain" ? "A plain square holds an odd number." : `The same number twice in a ${bad.rule}.`;
  } else {
    statusEl.className = "status";
    statusEl.textContent = play.undo.length === 0 && play.shown === 0 ? "Tinted squares are even, plain ones odd. Tap a square, then a number." : `${count(left, "square")} to go.`;
  }
}

/** Fit the grid to the room above the numbers, on any screen and either way up. */
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
/** Change squares as one thing that Undo takes back in one go. Squares that would not change are left out. */
function change(to: Change[]): void {
  const before: Change[] = [];
  for (const [i, value, notes] of to) {
    if (play.grid[i] === value && play.notes[i] === notes) continue;
    before.push([i, play.grid[i]!, play.notes[i]!]);
    play.grid[i] = value;
    play.notes[i] = notes;
  }
  if (!before.length) return;
  play.undo.push(before);
  if (play.undo.length > 400) play.undo.shift();
}
/** Put a number in a square, and rub that number out of the notes around it. */
function place(i: number, value: number): void {
  const to: Change[] = [[i, value, 0]];
  for (const p of layout(n).peers[i]!) {
    if (play.notes[p]! & (1 << value)) to.push([p, play.grid[p]!, play.notes[p]! & ~(1 << value)]);
  }
  change(to);
}
function free(): boolean {
  return !modalOpen() && !isSolved();
}

function select(i: number): void {
  if (!free()) return;
  selected = i === selected ? -1 : i;
  draw();
}
function enter(value: number): void {
  if (!free()) return;
  if (selected < 0) {
    say("Tap a square first.");
    return draw();
  }
  if (play.puzzle.givens[selected]) {
    say("That number was given. It stays.");
    return draw();
  }
  say();
  if (noting) {
    if (play.grid[selected]) return draw();
    change([[selected, 0, play.notes[selected]! ^ (1 << value)]]);
  } else if (play.grid[selected] === value) {
    change([[selected, 0, 0]]);
  } else {
    place(selected, value);
  }
  finishIfSolved();
  save();
  draw();
}
function erase(): void {
  if (!free() || selected < 0 || play.puzzle.givens[selected]) return;
  say();
  change([[selected, 0, 0]]);
  save();
  draw();
}
function toggleNotes(): void {
  if (!free()) return;
  noting = !noting;
  say(noting ? "Notes on: numbers go in small. Tap Notes again to turn it off." : "");
  draw();
}
function undo(): void {
  if (!free()) return;
  const last = play.undo.pop();
  if (!last) return;
  for (const [i, value, notes] of last) {
    play.grid[i] = value;
    play.notes[i] = notes;
  }
  say();
  save();
  draw();
}

function explain(d: Deduction): string {
  switch (d.reason) {
    case "only": return `Its row, column, box and tint leave only ${d.value} for this square.`;
    case "trial": return `Any other number here soon runs into a clash, so it is ${d.value}.`;
    default: return `In this ${d.reason}, ${d.value} can go nowhere else.`;
  }
}
/** Show one step: first a square that is wrong, otherwise the next square that can be worked out. */
function showStep(): void {
  if (!free()) return;
  const { solution } = play.puzzle;
  const wrong = play.grid.findIndex((v, i) => v !== 0 && v !== solution[i]);
  if (wrong >= 0) {
    change([[wrong, 0, play.notes[wrong]!]]);
    play.shown++;
    selected = wrong;
    say("That number was not right, so I rubbed it out.");
    save();
    return draw(wrong);
  }
  const d = deduce(play.grid, even, n) ?? (() => {
    // Nothing short to say: give the square with the fewest numbers open to it
    const L = layout(n);
    let best = -1;
    let fewest = 99;
    play.grid.forEach((v, i) => {
      if (v !== 0) return;
      const open = allowed(play.grid, even, L, i).toString(2).replace(/0/g, "").length;
      if (open < fewest) [best, fewest] = [i, open];
    });
    return best < 0 ? null : ({ index: best, value: solution[best]!, reason: "trial" } satisfies Deduction);
  })();
  if (!d) return;
  place(d.index, d.value);
  play.shown++;
  selected = d.index;
  say(explain(d));
  finishIfSolved();
  save();
  draw(d.index);
}

function open(next: Play): void {
  play = next;
  n = sizeOf(play.puzzle.level);
  even = tints(play.puzzle.solution);
  selected = -1;
  noting = false;
  say();
  save();
  build();
  draw();
}

undoButton.addEventListener("click", undo);
hintButton.addEventListener("click", showStep);
el<HTMLButtonElement>("next").addEventListener("click", () => open(fresh(play.puzzle.level)));
el<HTMLButtonElement>("rules").addEventListener("click", () => {
  rulebookEl.hidden = false;
  el<HTMLButtonElement>("rules-close").focus();
});
el<HTMLButtonElement>("rules-close").addEventListener("click", () => {
  rulebookEl.hidden = true;
});

// The only way to drop a puzzle is the button in the top bar, and it always asks what you want
newButton.addEventListener("click", () => {
  const touched = play.grid.some((v, i) => v !== play.puzzle.givens[i]) || play.notes.some((v) => v !== 0);
  const under = touched && !isSolved();
  chooserText.textContent = under ? "Choosing one leaves the puzzle you are on. It will not come back." : "Choose a puzzle. In all of them, tinted squares hold even numbers.";
  restartButton.hidden = !under;
  chooserEl.hidden = false;
});
el<HTMLButtonElement>("chooser-no").addEventListener("click", () => {
  chooserEl.hidden = true;
});
restartButton.addEventListener("click", () => {
  chooserEl.hidden = true;
  open({ ...play, grid: play.puzzle.givens.slice(), notes: play.puzzle.givens.map(() => 0), undo: [] });
});
for (const button of chooserEl.querySelectorAll<HTMLButtonElement>("[data-level]")) {
  button.addEventListener("click", () => {
    const level = LEVELS.find((l) => l === button.dataset.level);
    if (!level) return;
    chooserEl.hidden = true;
    open(fresh(level));
  });
}

// A keyboard works too: arrows to move, numbers to fill, Backspace to rub out, N for notes
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    chooserEl.hidden = true;
    rulebookEl.hidden = true;
    return;
  }
  if (!free() || e.metaKey || e.ctrlKey || e.altKey) return;
  const step = ({ ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 } as Record<string, number | undefined>)[e.key];
  if (step !== undefined) {
    e.preventDefault();
    const from = selected < 0 ? 0 : selected;
    const sideways = Math.abs(step) === 1;
    const to = selected < 0 ? 0 : from + step;
    if (to < 0 || to >= n * n || (sideways && Math.floor(to / n) !== Math.floor(from / n))) return;
    selected = to;
    draw();
  } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) {
    enter(Number(e.key));
  } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
    erase();
  } else if (e.key === "n" || e.key === "N") {
    toggleNotes();
  }
});
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", fit);
if ("ResizeObserver" in window) new ResizeObserver(fit).observe(climbEl);

finishIfSolved();
save();
build();
draw();
