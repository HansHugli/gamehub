import { lockPage, stored } from "../shell.ts";
import { bestMove, canFinish, deal, finishStep, hint, isRed, legal, play as playMove, rankOf, restore, suitOf, turn, won, type Card, type Game, type Move, type Place } from "./game.ts";

const SAVE_KEY = "gamehub.solitaire.game.v1";
const PREFS_KEY = "gamehub.solitaire.prefs.v1";
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
// The text form of each suit, so a phone does not swap in a coloured picture
const SUITS = ["♠︎", "♥︎", "♦︎", "♣︎"];
const BACKS = [["lattice", "Lattice"], ["stripes", "Stripes"], ["dots", "Dots"], ["diamonds", "Diamonds"], ["sunrise", "Sunrise"], ["night", "Night"], ["weave", "Weave"], ["forest", "Forest"]] as const;
/** A press that travels this far, in CSS pixels, is a drag and not a tap. */
const DRAG = 8;

interface Saved {
  game: Game;
  /** The deal as it was first laid out, for starting it over. */
  dealt: Game;
  before: Game[];
  shown: number;
  counted: boolean;
}
interface Prefs {
  back: string;
  won: number;
}
/** Where a card sits on the table, worked out from the game each time it is drawn. */
interface Spot {
  x: number;
  y: number;
  z: number;
  up: boolean;
  /** What a press on it can pick up, or null when it cannot be moved. */
  from: Place | null;
  count: number;
  pile: "stock" | "waste" | "foundation" | "column";
}

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}
const climbEl = el("climb");
const tableEl = el("table");
const statusEl = el("status");
const undoButton = el<HTMLButtonElement>("undo");
const hintButton = el<HTMLButtonElement>("hint");
const finishButton = el<HTMLButtonElement>("finish");
const newButton = el<HTMLButtonElement>("new");
const chooserEl = el("chooser");
const chooserText = el("chooser-text");
const restartButton = el<HTMLButtonElement>("restart");
const backbookEl = el("backbook");
const swatchesEl = el("swatches");

lockPage();

function read(key: string): unknown {
  try {
    return JSON.parse(stored.get(key) ?? "null");
  } catch {
    return null;
  }
}
function readPrefs(): Prefs {
  const p = read(PREFS_KEY) as Partial<Prefs> | null;
  const back = BACKS.some(([id]) => id === p?.back) ? p!.back! : BACKS[0][0];
  return { back, won: typeof p?.won === "number" && p.won >= 0 ? Math.floor(p.won) : 0 };
}
function readSaved(): Saved | null {
  const s = read(SAVE_KEY) as Partial<Saved> | null;
  if (!s) return null;
  const game = restore(s.game);
  const dealt = restore(s.dealt);
  if (!game || !dealt) return null;
  const before = (Array.isArray(s.before) ? s.before : []).map((g) => restore(g)).filter((g): g is Game => g !== null);
  return { game, dealt, before: before.slice(-200), shown: typeof s.shown === "number" && s.shown >= 0 ? Math.floor(s.shown) : 0, counted: s.counted === true };
}
function fresh(draw: 1 | 3): Saved {
  const game = deal(Math.random, draw);
  return { game, dealt: game, before: [], shown: 0, counted: false };
}

const prefs = readPrefs();
let state: Saved = readSaved() ?? fresh(1);
let note: { text: string; kind: "" | "good" | "bad" } = { text: "", kind: "" };
let finishing = false;
let spots = new Map<Card, Spot>();
/** Sizes in CSS pixels, set by measure(). */
let metric = { w: 48, h: 68, gap: 6, top: 0, left: 0, room: 400 };

function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(state));
  stored.set(PREFS_KEY, JSON.stringify(prefs));
}
function count(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}
function modalOpen(): boolean {
  return !chooserEl.hidden || !backbookEl.hidden;
}

// ---- the table ----

const cardEls: HTMLElement[] = [];
const slotEls: { stock: HTMLElement; waste: HTMLElement; foundations: HTMLElement[]; columns: HTMLElement[] } = { stock: slot("stock"), waste: slot(""), foundations: [0, 1, 2, 3].map((s) => slot("", SUITS[s])), columns: [0, 1, 2, 3, 4, 5, 6].map(() => slot("")) };

function slot(kind: string, text = ""): HTMLElement {
  const s = document.createElement("div");
  s.className = "slot" + (kind ? " " + kind : "");
  s.textContent = text;
  tableEl.append(s);
  return s;
}
for (let c = 0; c < 52; c++) {
  const card = document.createElement("div");
  card.className = "card" + (isRed(c) ? " red" : "");
  card.dataset.card = String(c);
  const turnEl = document.createElement("div");
  turnEl.className = "turn";
  const front = document.createElement("div");
  front.className = "front";
  const corner = document.createElement("span");
  corner.className = "corner";
  corner.textContent = RANKS[rankOf(c)]! + SUITS[suitOf(c)]!;
  const pip = document.createElement("span");
  pip.className = "pip";
  pip.textContent = SUITS[suitOf(c)]!;
  front.append(corner, pip);
  const back = document.createElement("div");
  back.className = "back";
  turnEl.append(front, back);
  card.append(turnEl);
  tableEl.append(card);
  cardEls.push(card);
}
function setBack(id: string): void {
  prefs.back = id;
  for (const card of cardEls) card.querySelector(".back")!.className = "back back-" + id;
  for (const s of swatchesEl.querySelectorAll<HTMLElement>(".swatch")) s.classList.toggle("chosen", s.dataset.back === id);
}

/** Work out the card size from the room there is: seven columns across, and height for a long column. */
function measure(): void {
  const room = climbEl.getBoundingClientRect();
  const gapRatio = 0.12;
  const byWidth = room.width / (7 + 6 * gapRatio);
  // The top row, a gap, and a column of about a card and three quarters more at the least
  const byHeight = room.height / (1.42 * 3.1);
  const w = Math.floor(Math.max(26, Math.min(92, byWidth, byHeight)));
  const gap = w * gapRatio;
  metric = { w, h: w * 1.42, gap, top: 0, left: Math.max(0, (room.width - (7 * w + 6 * gap)) / 2), room: room.height };
  tableEl.style.setProperty("--w", `${w}px`);
}
const colX = (col: number): number => metric.left + col * (metric.w + metric.gap);
const columnTop = (): number => metric.h + metric.gap * 2.2;

/** Where every card belongs for a game, and what a press on it would pick up. */
function place(g: Game): Map<Card, Spot> {
  const out = new Map<Card, Spot>();
  g.stock.forEach((c, i) => out.set(c, { x: colX(0), y: 0, z: i, up: false, from: null, count: 0, pile: "stock" }));
  // The waste shows its last three fanned when three are turned at a time
  const fan = g.draw === 3 ? 3 : 1;
  g.waste.forEach((c, i) => {
    const fromTop = g.waste.length - 1 - i;
    const shift = fan === 3 ? Math.max(0, Math.min(2, g.waste.length - 1) - fromTop) : 0;
    out.set(c, { x: colX(1) + shift * metric.w * 0.32, y: 0, z: 100 + i, up: true, from: fromTop === 0 ? { pile: "waste" } : null, count: 1, pile: "waste" });
  });
  g.foundations.forEach((f, suit) => f.forEach((c, i) => out.set(c, { x: colX(3 + suit), y: 0, z: 200 + i, up: true, from: i === f.length - 1 ? { pile: "foundation", suit } : null, count: 1, pile: "foundation" })));
  const top = columnTop();
  g.columns.forEach((column, col) => {
    // Cards overlap; a long column is squeezed so that it still fits the room
    let downStep = metric.h * 0.16;
    let upStep = metric.h * 0.3;
    const need = column.down.length * downStep + Math.max(0, column.up.length - 1) * upStep + metric.h;
    const have = metric.room - top;
    if (need > have) {
      const squeeze = Math.max(0.35, (have - metric.h) / (need - metric.h));
      downStep *= squeeze;
      upStep *= squeeze;
    }
    let y = top;
    column.down.forEach((c, i) => {
      out.set(c, { x: colX(col), y, z: 300 + i, up: false, from: null, count: 0, pile: "column" });
      y += downStep;
    });
    column.up.forEach((c, i) => {
      out.set(c, { x: colX(col), y, z: 300 + column.down.length + i, up: true, from: { pile: "column", col }, count: column.up.length - i, pile: "column" });
      y += upStep;
    });
  });
  return out;
}

/** Put every card where the game says. Cards slide and turn over by CSS; `dealing` staggers them. */
function draw(dealing = false): void {
  const g = state.game;
  spots = place(g);
  const set = (node: HTMLElement, x: number, y: number) => {
    node.style.setProperty("--x", `${x}px`);
    node.style.setProperty("--y", `${y}px`);
  };
  set(slotEls.stock, colX(0), 0);
  set(slotEls.waste, colX(1), 0);
  slotEls.foundations.forEach((s, suit) => set(s, colX(3 + suit), 0));
  slotEls.columns.forEach((s, col) => set(s, colX(col), columnTop()));
  let order = 0;
  cardEls.forEach((node, c) => {
    const spot = spots.get(c)!;
    set(node, spot.x, spot.y);
    node.style.zIndex = String(spot.z);
    node.classList.toggle("up", spot.up);
    node.classList.remove("drag", "lift");
    node.style.setProperty("--i", String(spot.pile === "foundation" ? suitOf(c) * 13 + rankOf(c) : 0));
    const delay = dealing && spot.pile === "column" ? `${order++ * 22}ms` : "";
    node.style.transitionDelay = delay;
    (node.firstElementChild as HTMLElement).style.transitionDelay = delay;
    node.setAttribute("aria-label", spot.up ? `${RANKS[rankOf(c)]} of ${["spades", "hearts", "diamonds", "clubs"][suitOf(c)]}` : "A card face down");
  });
  const finished = won(g);
  tableEl.classList.toggle("won", finished);
  undoButton.disabled = state.before.length === 0 || finished || finishing;
  hintButton.hidden = finished || finishing;
  finishButton.hidden = finishing || !canFinish(g);
  newButton.classList.toggle("ready", finished);
  if (finished) {
    statusEl.className = "status good";
    statusEl.textContent = `You won in ${count(g.moves, "move")}. ${count(prefs.won, "game")} won.`;
  } else if (note.text) {
    statusEl.className = "status" + (note.kind ? " " + note.kind : "");
    statusEl.textContent = note.text;
  } else {
    statusEl.className = "status";
    statusEl.textContent = g.moves === 0 ? "Tap a card to send it where it goes, or drag it. Tap the pack to turn cards." : `${count(g.moves, "move")}. Turning ${g.draw === 1 ? "one card" : "three cards"}.`;
  }
}

/** Lay a new deal out: every card starts on the pack, then flies to its place in turn. */
function dealOut(): void {
  for (const node of cardEls) {
    node.classList.add("snap");
    node.classList.remove("up");
    node.style.setProperty("--x", `${colX(0)}px`);
    node.style.setProperty("--y", "0px");
    node.style.transitionDelay = "";
  }
  tableEl.classList.remove("won");
  void tableEl.offsetWidth;
  for (const node of cardEls) node.classList.remove("snap");
  draw(true);
}

// ---- playing ----

function commit(next: Game, shown = false): void {
  state.before.push(state.game);
  if (state.before.length > 200) state.before.shift();
  state.game = next;
  if (shown) state.shown++;
  if (won(next) && !state.counted) {
    state.counted = true;
    prefs.won++;
  }
  save();
}
function refuse(card: Card): void {
  const node = cardEls[card]!;
  node.classList.remove("no");
  void node.offsetWidth;
  node.classList.add("no");
}
/** Raise the cards a move carries above everything while they travel. */
function raise(cards: Card[]): void {
  cards.forEach((c, i) => {
    cardEls[c]!.style.zIndex = String(1000 + i);
    cardEls[c]!.classList.add("lift");
  });
  setTimeout(() => draw(), 210);
}
function cardsOf(g: Game, from: Place, n: number): Card[] {
  if (from.pile === "waste") return g.waste.slice(-1);
  if (from.pile === "foundation") return g.foundations[from.suit]!.slice(-1);
  const up = g.columns[from.col]!.up;
  return up.slice(up.length - n);
}
function make(m: Move, shown = false): boolean {
  const moving = cardsOf(state.game, m.from, m.count);
  const next = playMove(state.game, m);
  if (!next) return false;
  note = { text: "", kind: "" };
  commit(next, shown);
  draw();
  raise(moving);
  return true;
}
function turnStock(): void {
  if (modalOpen() || finishing || won(state.game)) return;
  const next = turn(state.game);
  if (!next) return;
  note = { text: "", kind: "" };
  commit(next);
  draw();
}
function tapCard(card: Card): void {
  const spot = spots.get(card);
  if (!spot) return;
  if (spot.pile === "stock") return turnStock();
  if (!spot.from) return refuse(card);
  const m = bestMove(state.game, spot.from, spot.count);
  if (!m || !make(m)) refuse(card);
}

function undo(): void {
  if (modalOpen() || finishing || won(state.game)) return;
  const last = state.before.pop();
  if (!last) return;
  state.game = last;
  note = { text: "", kind: "" };
  save();
  draw();
}

function flash(nodes: HTMLElement[]): void {
  for (const n of nodes) {
    n.classList.add("flash");
    setTimeout(() => n.classList.remove("flash"), 1300);
  }
}
/** Point out a move worth making: the cards to move and where they go. */
function showMove(): void {
  if (modalOpen() || finishing || won(state.game)) return;
  const h = hint(state.game);
  const g = state.game;
  if (h.kind === "none") {
    note = { text: "I can see no move left. Undo a few, or start a new game.", kind: "bad" };
    return draw();
  }
  state.shown++;
  if (h.kind === "turn") {
    note = { text: g.stock.length > 0 ? "Turn a card from the pack." : "Turn the pack over and go through it again.", kind: "" };
    draw();
    const topStock = g.stock.at(-1);
    return flash([topStock === undefined ? slotEls.stock : cardEls[topStock]!]);
  }
  const moving = cardsOf(g, h.move.from, h.move.count);
  const to = h.move.to;
  const target = to.pile === "foundation" ? (g.foundations[to.suit]!.at(-1) ?? null) : to.pile === "column" ? (g.columns[to.col]!.up.at(-1) ?? null) : null;
  const where = to.pile === "foundation" ? "its foundation" : target === null ? "the empty column" : `the ${RANKS[rankOf(target)]}${SUITS[suitOf(target)]}`;
  note = { text: `Move the ${RANKS[rankOf(moving[0]!)]}${SUITS[suitOf(moving[0]!)]} to ${where}.`, kind: "" };
  draw();
  flash([...moving.map((c) => cardEls[c]!), target === null ? (to.pile === "foundation" ? slotEls.foundations[to.suit]! : to.pile === "column" ? slotEls.columns[to.col]! : slotEls.waste) : cardEls[target]!]);
}

/** Play a finished game out card by card. */
function finish(): void {
  if (modalOpen() || finishing || !canFinish(state.game)) return;
  finishing = true;
  note = { text: "Playing it out…", kind: "" };
  const step = () => {
    const next = won(state.game) ? null : finishStep(state.game);
    if (!next) {
      finishing = false;
      note = { text: "", kind: "" };
      return draw();
    }
    commit(next);
    draw();
    setTimeout(step, 85);
  };
  step();
}

function start(drawCount: 1 | 3): void {
  finishing = false;
  state = fresh(drawCount);
  note = { text: "", kind: "" };
  save();
  dealOut();
}

// ---- touch and mouse: a tap sends a card where it goes, a drag carries it ----

let press: { card: Card; id: number; x: number; y: number; dragging: boolean; cards: Card[] } | null = null;

tableEl.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary || modalOpen() || finishing || won(state.game)) return;
  const node = (e.target as Element).closest<HTMLElement>(".card");
  if (!node) {
    if ((e.target as Element).closest(".slot.stock")) turnStock();
    return;
  }
  const card = Number(node.dataset.card);
  const spot = spots.get(card);
  press = { card, id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, cards: spot?.from ? cardsOf(state.game, spot.from, spot.count) : [] };
  try {
    tableEl.setPointerCapture(e.pointerId);
  } catch {
    /* the pointer is already gone */
  }
});
tableEl.addEventListener("pointermove", (e) => {
  if (!press || e.pointerId !== press.id) return;
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  if (!press.dragging) {
    if (Math.hypot(dx, dy) < DRAG || press.cards.length === 0) return;
    press.dragging = true;
  }
  press.cards.forEach((c, i) => {
    const spot = spots.get(c)!;
    const node = cardEls[c]!;
    node.classList.add("drag");
    node.style.zIndex = String(1000 + i);
    node.style.setProperty("--x", `${spot.x + dx}px`);
    node.style.setProperty("--y", `${spot.y + dy}px`);
  });
});
function release(e: PointerEvent, cancelled: boolean): void {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  if (cancelled) return draw();
  if (!p.dragging) return tapCard(p.card);
  // Dropped: the place under the middle of the lowest carried card
  const spot = spots.get(p.card)!;
  const cx = spot.x + (e.clientX - p.x) + metric.w / 2;
  const cy = spot.y + (e.clientY - p.y) + metric.h / 2;
  const col = Math.max(0, Math.min(6, Math.round((cx - metric.left - metric.w / 2) / (metric.w + metric.gap))));
  // The top row to the right is the foundations; a card dropped there goes to its own suit's pile
  const to: Place = cy < metric.h + metric.gap && col >= 3 ? { pile: "foundation", suit: suitOf(p.card) } : { pile: "column", col };
  const m: Move = { from: spot.from!, to, count: spot.count };
  for (const c of p.cards) cardEls[c]!.classList.remove("drag");
  if (!legal(state.game, m) || !make(m)) draw();
}
tableEl.addEventListener("pointerup", (e) => release(e, false));
tableEl.addEventListener("pointercancel", (e) => release(e, true));
// Older Safari scrolls the page under a drag unless the touch itself is refused
climbEl.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

undoButton.addEventListener("click", undo);
hintButton.addEventListener("click", showMove);
finishButton.addEventListener("click", finish);

// Card backs: tap one and it is used at once, and remembered
for (const [id, name] of BACKS) {
  const s = document.createElement("button");
  s.type = "button";
  s.className = `swatch back-${id}`;
  s.dataset.back = id;
  s.setAttribute("aria-label", name);
  const label = document.createElement("span");
  label.textContent = name;
  s.append(label);
  s.addEventListener("click", () => {
    setBack(id);
    save();
  });
  swatchesEl.append(s);
}
el<HTMLButtonElement>("backs").addEventListener("click", () => {
  backbookEl.hidden = false;
});
el<HTMLButtonElement>("backs-close").addEventListener("click", () => {
  backbookEl.hidden = true;
});

// The only way to drop a game is the button in the top bar, and it always asks what you want
newButton.addEventListener("click", () => {
  const under = state.game.moves > 0 && !won(state.game);
  chooserText.textContent = under ? "A new game leaves the one you are playing. It will not come back." : "How many cards should the pack turn at a time?";
  restartButton.hidden = !under;
  chooserEl.hidden = false;
});
el<HTMLButtonElement>("chooser-no").addEventListener("click", () => {
  chooserEl.hidden = true;
});
restartButton.addEventListener("click", () => {
  chooserEl.hidden = true;
  finishing = false;
  state = { ...state, game: state.dealt, before: [] };
  note = { text: "", kind: "" };
  save();
  dealOut();
});
for (const button of chooserEl.querySelectorAll<HTMLButtonElement>("[data-draw]")) {
  button.addEventListener("click", () => {
    chooserEl.hidden = true;
    start(button.dataset.draw === "3" ? 3 : 1);
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  chooserEl.hidden = true;
  backbookEl.hidden = true;
});

let fitted = "";
/** Measure and redraw when the room has really changed (the first report from the observer has not). */
function refit(): void {
  const room = climbEl.getBoundingClientRect();
  const now = `${Math.round(room.width)}x${Math.round(room.height)}`;
  if (now === fitted) return;
  fitted = now;
  measure();
  draw();
}
window.addEventListener("resize", refit);
window.addEventListener("orientationchange", refit);
if ("ResizeObserver" in window) new ResizeObserver(refit).observe(climbEl);

setBack(prefs.back);
save();
measure();
fitted = `${Math.round(climbEl.getBoundingClientRect().width)}x${Math.round(climbEl.getBoundingClientRect().height)}`;
if (state.game.moves === 0 && state.before.length === 0) dealOut();
else draw();
