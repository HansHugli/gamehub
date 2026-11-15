import { lockPage, stored } from "../shell.ts";
import { COLOURS, DEPTH, anyMove, canPour, complete, deal, done, pour, restore, solve, type Bottle } from "./game.ts";

const SAVE_KEY = "gamehub.decant.game.v1";
const TALLY_KEY = "gamehub.decant.tally.v1";

/** A puzzle under way: how it was dealt, how it stands, and every earlier standing for undo. */
interface Play {
  dealt: Bottle[];
  bottles: Bottle[];
  before: Bottle[][];
  pours: number;
  shown: number;
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
const shelfEl = el("shelf");
const statusEl = el("status");
const toolsEl = el("tools");
const afterEl = el("after");
const undoButton = el<HTMLButtonElement>("undo");
const hintButton = el<HTMLButtonElement>("hint");
const newButton = el<HTMLButtonElement>("new");
const chooserEl = el("chooser");
const chooserText = el("chooser-text");
const restartButton = el<HTMLButtonElement>("restart");

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
  const dealt = restore(p.dealt);
  const bottles = restore(p.bottles);
  if (!dealt || !bottles || dealt.length !== bottles.length) return null;
  const before = (Array.isArray(p.before) ? p.before : []).map((b) => restore(b)).filter((b): b is Bottle[] => b !== null && b.length === dealt.length);
  const whole = (n: unknown): number => (typeof n === "number" && n >= 0 ? Math.floor(n) : 0);
  return { dealt, bottles, before: before.slice(-300), pours: whole(p.pours), shown: whole(p.shown), counted: p.counted === true };
}
function fresh(colours: number): Play {
  const dealt = deal(colours);
  return { dealt, bottles: dealt, before: [], pours: 0, shown: 0, counted: false };
}

const tally = readTally();
let play: Play = readPlay() ?? fresh(COLOURS[0]);
/** The bottle picked up, waiting for where to pour it. */
let held = -1;
let note: { text: string; kind: "" | "good" | "bad" } = { text: "", kind: "" };

function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(play));
  stored.set(TALLY_KEY, JSON.stringify(tally));
}
function count(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

// ---- drawing ----

/** Draw the shelf. `arrived` marks layers that were just poured in, `to` a bottle pointed out. */
function draw(arrived: { bottle: number; layers: number } | null = null, to = -1, refused = -1): void {
  const finished = done(play.bottles);
  shelfEl.textContent = "";
  play.bottles.forEach((b, i) => {
    const bottle = document.createElement("button");
    bottle.type = "button";
    bottle.className = "bottle" + (i === held ? " held" : "") + (complete(b) ? " sorted" : "") + (i === to ? " to" : "") + (i === refused ? " no" : "");
    bottle.setAttribute("aria-label", `Bottle ${i + 1}: ${b.length === 0 ? "empty" : `${b.length} of ${DEPTH} full`}${i === held ? ", picked up" : ""}`);
    b.forEach((colour, k) => {
      const layer = document.createElement("span");
      layer.className = `layer c${colour}` + (arrived && arrived.bottle === i && k >= b.length - arrived.layers ? " in" : "");
      bottle.append(layer);
    });
    bottle.addEventListener("click", () => tap(i));
    shelfEl.append(bottle);
  });
  toolsEl.hidden = finished;
  afterEl.hidden = !finished;
  undoButton.disabled = play.before.length === 0;
  newButton.classList.toggle("ready", finished);
  if (finished) {
    statusEl.className = "status good";
    statusEl.textContent = `Sorted in ${count(play.pours, "pour")}${play.shown ? `, ${play.shown} of them shown` : ""}. ${count(tally.solved, "puzzle")} solved, ${tally.unaided} without help.`;
  } else if (note.text) {
    statusEl.className = "status" + (note.kind ? " " + note.kind : "");
    statusEl.textContent = note.text;
  } else if (!anyMove(play.bottles)) {
    statusEl.className = "status bad";
    statusEl.textContent = "Nothing can be poured. Undo, or start this one over from New puzzle.";
  } else {
    statusEl.className = "status";
    statusEl.textContent = play.pours === 0 ? "Tap a bottle, then the bottle to pour into. Colour goes onto the same colour, or into an empty bottle." : `${count(play.pours, "pour")} so far.`;
  }
}

/** Size the bottles to the room: one row for a few, two rows for more. */
function fit(): void {
  const n = play.bottles.length;
  const cols = n <= 6 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const room = climbEl.getBoundingClientRect();
  const byWidth = room.width / (cols + (cols - 1) * 0.34);
  const byHeight = (room.height - 4) / (rows * 3.5 + (rows - 1) * 0.75 + 0.45);
  shelfEl.style.setProperty("--cols", String(cols));
  shelfEl.style.setProperty("--w", `${Math.floor(Math.max(20, Math.min(60, byWidth, byHeight)))}px`);
}

// ---- playing ----

function doPour(from: number, to: number, shown: boolean): void {
  const result = pour(play.bottles, from, to);
  if (result.moved === 0) return;
  play.before.push(play.bottles);
  if (play.before.length > 300) play.before.shift();
  play.bottles = result.bottles;
  play.pours++;
  if (shown) play.shown++;
  held = -1;
  if (done(play.bottles) && !play.counted) {
    play.counted = true;
    tally.solved++;
    if (play.shown === 0) tally.unaided++;
  }
  save();
  draw({ bottle: to, layers: result.moved }, shown ? to : -1);
}

function tap(i: number): void {
  if (!chooserEl.hidden || done(play.bottles)) return;
  note = { text: "", kind: "" };
  const bottle = play.bottles[i]!;
  if (held < 0) {
    // Picking up: an empty bottle has nothing to pour, and a sorted one is finished
    if (bottle.length === 0 || complete(bottle)) return draw(null, -1, i);
    held = i;
    return draw();
  }
  if (held === i) {
    held = -1;
    return draw();
  }
  if (canPour(play.bottles, held, i)) return doPour(held, i, false);
  // Not somewhere it can go: pick that bottle up instead if it has something to pour
  if (bottle.length > 0 && !complete(bottle)) {
    held = i;
    return draw();
  }
  draw(null, -1, i);
}

function undo(): void {
  if (!chooserEl.hidden || done(play.bottles)) return;
  const last = play.before.pop();
  if (!last) return;
  play.bottles = last;
  play.pours = Math.max(0, play.pours - 1);
  held = -1;
  note = { text: "", kind: "" };
  save();
  draw();
}

/** Make the next pour of a way to finish from here, or say that none can be seen. */
function showPour(): void {
  if (!chooserEl.hidden || done(play.bottles)) return;
  const way = solve(play.bottles);
  held = -1;
  if (!Array.isArray(way) || way.length === 0) {
    note = { text: way === null ? "I can see no way to finish from here. Undo a few pours, or start this one over." : "I cannot tell from here. Try undoing a few pours.", kind: "bad" };
    return draw();
  }
  const [from, to] = way[0]!;
  note = { text: `Bottle ${from + 1} into bottle ${to + 1}.`, kind: "" };
  doPour(from, to, true);
}

function start(colours: number): void {
  play = fresh(colours);
  held = -1;
  note = { text: "", kind: "" };
  save();
  fit();
  draw();
}

undoButton.addEventListener("click", undo);
hintButton.addEventListener("click", showPour);
el<HTMLButtonElement>("next").addEventListener("click", () => start(play.bottles.length - 2));

// The only way to drop a puzzle is the button in the top bar, and it always asks what you want
newButton.addEventListener("click", () => {
  const under = play.pours > 0 && !done(play.bottles);
  chooserText.textContent = under ? "Choosing a size leaves the puzzle you are on. It will not come back." : "Choose how many colours.";
  restartButton.hidden = !under;
  chooserEl.hidden = false;
});
el<HTMLButtonElement>("chooser-no").addEventListener("click", () => {
  chooserEl.hidden = true;
});
restartButton.addEventListener("click", () => {
  chooserEl.hidden = true;
  play = { ...play, bottles: play.dealt, before: [], pours: 0 };
  held = -1;
  note = { text: "", kind: "" };
  save();
  draw();
});
for (const button of chooserEl.querySelectorAll<HTMLButtonElement>("[data-colours]")) {
  button.addEventListener("click", () => {
    chooserEl.hidden = true;
    start(Number(button.dataset.colours));
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") chooserEl.hidden = true;
});
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", fit);
if ("ResizeObserver" in window) new ResizeObserver(fit).observe(climbEl);

save();
fit();
draw();
