import { lockPage, stored } from "../shell.ts";
import { Lexicon, puzzleBetween, randomPuzzle, step, unpack, validLadder, type Puzzle } from "./game.ts";
import { PAIRS } from "./puzzles.ts";
import { COMMON, RARER } from "./words.ts";

const SAVE_KEY = "gamehub.ladder.game.v1";
const RECORD_KEY = "gamehub.ladder.record.v1";

/** A puzzle under way: the words climbed so far (the start first) and which were given as hints. */
interface Play {
  puzzle: Puzzle;
  ladder: string[];
  given: string[];
  /** The solve has been counted in the record. */
  counted: boolean;
}
/** What is kept between puzzles: how many were solved, and the hand-picked pairs still to come. */
interface Tally {
  solved: number;
  atBest: number;
  queue: number[];
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}
const goalEl = el("goal");
const rungsEl = el("rungs");
const statusEl = el("status");
const toolsEl = el("tools");
const keysEl = el("keys");
const afterEl = el("after");
const undoButton = el<HTMLButtonElement>("undo");
const hintButton = el<HTMLButtonElement>("hint");
const shortestButton = el<HTMLButtonElement>("shortest");
const nextButton = el<HTMLButtonElement>("next");
const newButton = el<HTMLButtonElement>("new");
const confirmEl = el("confirm");
const confirmText = el("confirm-text");
const confirmYes = el<HTMLButtonElement>("confirm-yes");
const confirmNo = el<HTMLButtonElement>("confirm-no");

lockPage();
const common = new Lexicon(unpack(COMMON));
const accepted = new Lexicon([...unpack(COMMON), ...unpack(RARER)]);

function read(key: string): unknown {
  try {
    return JSON.parse(stored.get(key) ?? "null");
  } catch {
    return null;
  }
}
function readRecord(): Tally {
  const r = read(RECORD_KEY) as Partial<Tally> | null;
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (r && whole(r.solved) && whole(r.atBest) && Array.isArray(r.queue) && r.queue.every((i) => whole(i) && i < PAIRS.length)) return { solved: r.solved, atBest: r.atBest, queue: r.queue };
  // The hand-picked pairs in a mixed order, each played once
  const queue = PAIRS.map((_, i) => i);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  return { solved: 0, atBest: 0, queue };
}
function readPlay(): Play | null {
  const p = read(SAVE_KEY) as Partial<Play> | null;
  if (!p || typeof p.puzzle !== "object" || p.puzzle === null) return null;
  // The puzzle is worked out again from its two words, so a saved par cannot be wrong
  const puzzle = puzzleBetween(common, String(p.puzzle.start), String(p.puzzle.end));
  if (!puzzle || !validLadder(puzzle, p.ladder, accepted)) return null;
  const given = Array.isArray(p.given) ? p.given.filter((w): w is string => typeof w === "string" && p.ladder!.includes(w)) : [];
  return { puzzle, ladder: p.ladder, given, counted: p.counted === true };
}

const record = readRecord();
let play: Play = readPlay() ?? fresh();
/** Which letter of the top word the next key changes. */
let picked = firstToChange();
let note: { text: string; kind: "" | "good" | "bad" } = { text: "", kind: "" };

function fresh(): Play {
  let puzzle: Puzzle | null = null;
  while (!puzzle && record.queue.length > 0) {
    const pair = PAIRS[record.queue.shift()!]!;
    puzzle = puzzleBetween(common, pair[0], pair[1]);
  }
  puzzle ??= randomPuzzle(common);
  return { puzzle, ladder: [puzzle.start], given: [], counted: false };
}
function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(play));
  stored.set(RECORD_KEY, JSON.stringify(record));
}
function top(): string {
  return play.ladder[play.ladder.length - 1]!;
}
function solved(): boolean {
  return top() === play.puzzle.end;
}
function steps(): number {
  return play.ladder.length - 1;
}
function count(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}
function firstToChange(): number {
  const at = [...top()].findIndex((ch, i) => ch !== play.puzzle.end[i]);
  return at < 0 ? 0 : at;
}

// ---- drawing ----

function rung(word: string, kind: string, label: string, pick = false): HTMLElement {
  const row = document.createElement("div");
  row.className = "rung " + kind;
  const n = document.createElement("span");
  n.className = "n";
  n.textContent = label;
  row.append(n);
  [...word].forEach((ch, i) => {
    const letter = document.createElement(pick ? "button" : "span");
    letter.className = "letter" + (ch === play.puzzle.end[i] && !kind.includes("end") ? " home" : "") + (pick && i === picked ? " picked" : "");
    letter.textContent = ch;
    if (pick) {
      (letter as HTMLButtonElement).type = "button";
      letter.setAttribute("aria-label", `Letter ${i + 1}, ${ch.toUpperCase()}${i === picked ? ", chosen" : ""}`);
      letter.addEventListener("click", () => {
        picked = i;
        draw();
      });
    }
    row.append(letter);
  });
  const pad = document.createElement("span");
  pad.className = "n after";
  row.append(pad);
  return row;
}

function draw(added = false): void {
  const done = solved();
  const { start, end, par } = play.puzzle;
  goalEl.innerHTML = "";
  goalEl.append("Change ", bold(start), " into ", bold(end), `, one letter at a time. It can be done in ${par}.`);
  rungsEl.textContent = "";
  play.ladder.forEach((word, i) => {
    const last = i === play.ladder.length - 1;
    const kind = (done && last ? "done" : last ? "top" : "past") + (play.given.includes(word) ? " given" : "") + (last && added ? " new" : "");
    rungsEl.append(rung(word, kind, i === 0 ? "" : String(i), last && !done));
  });
  if (!done) {
    const gap = document.createElement("div");
    gap.className = "gap";
    gap.textContent = "to";
    rungsEl.append(gap, rung(end, "end", ""));
  }
  rungsEl.querySelector(".rung.top, .rung.done")?.scrollIntoView({ block: "nearest" });
  if (!done) rungsEl.lastElementChild?.scrollIntoView({ block: "nearest" });

  keysEl.hidden = done;
  toolsEl.hidden = done;
  afterEl.hidden = !done;
  undoButton.disabled = play.ladder.length < 2;
  newButton.classList.toggle("ready", done);
  shortestButton.hidden = !done || steps() <= par;
  if (done) {
    const hints = play.given.length;
    const how = `Solved in ${count(steps(), "step")}${hints ? ` with ${count(hints, "given step")}` : ""}.`;
    const verdict = steps() < par ? ` That beats the ${par} I found.` : steps() === par ? " That is the fewest possible." : ` It can be done in ${par}.`;
    statusEl.className = "status good";
    statusEl.textContent = note.text || `${how}${verdict} ${count(record.solved, "puzzle")} solved, ${record.atBest} in the fewest steps.`;
  } else {
    statusEl.className = "status" + (note.kind ? " " + note.kind : "");
    statusEl.textContent = note.text || (steps() === 0 ? "Tap a letter of the word, then the letter to change it to." : `${count(steps(), "step")} so far.`);
  }
}
function bold(word: string): HTMLElement {
  const b = document.createElement("b");
  b.textContent = word.toUpperCase();
  return b;
}
function shake(): void {
  const row = rungsEl.querySelector(".rung.top");
  if (!row) return;
  row.classList.remove("no");
  void (row as HTMLElement).offsetWidth;
  row.classList.add("no");
}

// ---- playing ----

function finishIfSolved(): void {
  if (!solved() || play.counted) return;
  play.counted = true;
  record.solved++;
  // A given step is help, so only an unaided solve counts as done in the fewest
  if (steps() <= play.puzzle.par && play.given.length === 0) record.atBest++;
}

function type(letter: string): void {
  if (!confirmEl.hidden || solved()) return;
  const word = top().slice(0, picked) + letter + top().slice(picked + 1);
  const tried = step(play.ladder, word, accepted);
  if (tried.problem === "same") return;
  if (tried.problem) {
    note = { text: `${word.toUpperCase()} is not a word I know.`, kind: "bad" };
    draw();
    shake();
    return;
  }
  const grew = tried.ladder.length > play.ladder.length;
  play.ladder = tried.ladder;
  play.given = play.given.filter((w) => play.ladder.includes(w));
  note = { text: grew ? "" : `Back to ${word.toUpperCase()}.`, kind: "" };
  finishIfSolved();
  if (!solved() && top()[picked] === play.puzzle.end[picked]) picked = firstToChange();
  save();
  draw(grew);
}

function undo(): void {
  if (!confirmEl.hidden || solved() || play.ladder.length < 2) return;
  const gone = play.ladder.pop()!;
  play.given = play.given.filter((w) => w !== gone);
  note = { text: "", kind: "" };
  picked = Math.min(picked, top().length - 1);
  save();
  draw();
}

/** Add the next word of a shortest way on from here, in everyday words where there is one. */
function giveStep(): void {
  if (!confirmEl.hidden || solved()) return;
  const way = common.path(top(), play.puzzle.end) ?? accepted.path(top(), play.puzzle.end);
  const next = way?.[1];
  if (!next) {
    note = { text: "There is no way on from this word. Go back a step.", kind: "bad" };
    return draw();
  }
  // A word already on the ladder would mean the ladder had wandered; climb back down to it
  const back = play.ladder.indexOf(next);
  if (back >= 0) play.ladder = play.ladder.slice(0, back + 1);
  else {
    play.ladder.push(next);
    play.given.push(next);
  }
  play.given = play.given.filter((w) => play.ladder.includes(w));
  note = { text: `A step for you: ${next.toUpperCase()}.`, kind: "" };
  finishIfSolved();
  if (solved()) note = { text: "", kind: "" };
  else picked = firstToChange();
  save();
  draw(true);
}

function nextPuzzle(): void {
  play = fresh();
  picked = firstToChange();
  note = { text: "", kind: "" };
  save();
  draw();
}

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
for (const letters of ROWS) {
  const row = document.createElement("div");
  row.className = "row";
  for (const ch of letters) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key";
    key.textContent = ch;
    key.dataset.key = ch;
    key.addEventListener("click", () => type(ch));
    row.append(key);
  }
  keysEl.append(row);
}
undoButton.addEventListener("click", undo);
hintButton.addEventListener("click", giveStep);
nextButton.addEventListener("click", nextPuzzle);
shortestButton.addEventListener("click", () => {
  const way = common.path(play.puzzle.start, play.puzzle.end);
  if (!way) return;
  note = { text: way.map((w) => w.toUpperCase()).join(" → "), kind: "good" };
  draw();
});

// The only way to drop a puzzle is the button in the top bar; with steps taken it asks first
newButton.addEventListener("click", () => {
  if (solved() || steps() === 0) return nextPuzzle();
  confirmText.textContent = `You are ${count(steps(), "step")} into ${play.puzzle.start.toUpperCase()} to ${play.puzzle.end.toUpperCase()}. It will not come back.`;
  confirmEl.hidden = false;
  confirmNo.focus();
});
confirmNo.addEventListener("click", () => {
  confirmEl.hidden = true;
});
confirmYes.addEventListener("click", () => {
  confirmEl.hidden = true;
  nextPuzzle();
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!confirmEl.hidden) {
    if (e.key === "Escape") confirmEl.hidden = true;
    return;
  }
  if (solved()) return;
  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    type(e.key.toLowerCase());
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    picked = (picked + (e.key === "ArrowLeft" ? -1 : 1) + top().length) % top().length;
    draw();
  } else if (e.key === "Backspace") {
    e.preventDefault();
    undo();
  }
});

finishIfSolved();
save();
draw();
