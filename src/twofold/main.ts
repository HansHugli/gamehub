import { lockPage, stored } from "../shell.ts";
import { SIZE, TARGET, canMove, highest, move, newGame, restore, spawn, type Dir, type Game, type Tile } from "./game.ts";

const SAVE_KEY = "gamehub.twofold.game.v1";
const BEST_KEY = "gamehub.twofold.best.v1";
/** How long a slide takes; a tile that merged away is removed when it ends. Matches the CSS. */
const SLIDE_MS = 110;
/** A drag this long, in CSS pixels, is a swipe. */
const SWIPE = 22;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}
const play = el("play");
const board = el("board");
const layer = el("tiles");
const scoreEl = el("score");
const bestEl = el("best");
const topEl = el("top");
const statusEl = el("status");
const newButton = el<HTMLButtonElement>("new");
const confirmEl = el("confirm");
const confirmText = el("confirm-text");
const confirmYes = el<HTMLButtonElement>("confirm-yes");
const confirmNo = el<HTMLButtonElement>("confirm-no");

lockPage();
board.querySelector(".cells")!.innerHTML = "<i></i>".repeat(SIZE * SIZE);

let game: Game = restore(readSave()) ?? newGame();
let best = Math.max(Number(stored.get(BEST_KEY)) || 0, game.score);
let moves = 0;
const shown = new Map<number, HTMLElement>();

function readSave(): unknown {
  try {
    return JSON.parse(stored.get(SAVE_KEY) ?? "null");
  } catch {
    return null;
  }
}
function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(game));
  stored.set(BEST_KEY, String(best));
}

// ---- drawing ----

function tileClass(value: number, extra = ""): string {
  const digits = String(value).length;
  return `tile ${value > TARGET ? "beyond" : "v" + value}${digits >= 3 ? " d" + Math.min(digits, 6) : ""}${extra ? " " + extra : ""}`;
}
function place(node: HTMLElement, t: Tile): void {
  node.style.setProperty("--row", String(t.row));
  node.style.setProperty("--col", String(t.col));
}
function addTile(t: Tile, extra = ""): void {
  const node = document.createElement("div");
  node.className = tileClass(t.value, extra);
  place(node, t);
  const face = document.createElement("div");
  face.className = "face";
  face.textContent = String(t.value);
  node.append(face);
  layer.append(node);
  shown.set(t.id, node);
}
/** Put the whole board on screen with no animation (a new or restored game). */
function drawAll(): void {
  layer.textContent = "";
  shown.clear();
  for (const t of game.tiles) addTile(t);
  drawNumbers();
}
function drawNumbers(): void {
  scoreEl.textContent = game.score.toLocaleString("en-US");
  bestEl.textContent = best.toLocaleString("en-US");
  topEl.textContent = highest(game).toLocaleString("en-US");
  const over = !canMove(game);
  const top = highest(game);
  newButton.classList.toggle("ready", over);
  statusEl.className = "status" + (over ? " over" : game.reached ? " good" : "");
  if (over) statusEl.textContent = game.reached ? `No moves left. You made ${TARGET} and got to ${top.toLocaleString("en-US")}. New game is at the top.` : `No moves left. Your top tile was ${top.toLocaleString("en-US")}. New game is at the top.`;
  else if (game.reached) statusEl.textContent = top > TARGET ? `Past ${TARGET}. See how far you get.` : `You made ${TARGET}! Keep going and see how far you get.`;
  else statusEl.textContent = `Join equal tiles. Make ${TARGET}.`;
}

/** Fit the board to the room left under the top bar, on any screen and either way up. */
function fit(): void {
  const room = play.getBoundingClientRect();
  const style = getComputedStyle(play);
  const wide = room.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const high = room.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  let size: number;
  if (style.display === "grid") {
    // On its side: the board has the whole height, and leaves room beside it for the numbers
    size = Math.min(high, wide - 190);
  } else {
    const above = board.getBoundingClientRect().top - room.top - parseFloat(style.paddingTop);
    const hint = play.querySelector<HTMLElement>(".hint")!;
    size = Math.min(wide, high - above - hint.offsetHeight - 12);
  }
  board.style.setProperty("--size", `${Math.floor(Math.max(160, Math.min(520, size)))}px`);
}

// ---- playing ----

function act(dir: Dir): void {
  if (!confirmEl.hidden) return;
  const result = move(game, dir);
  if (!result.moved) return;
  moves++;
  // Tiles that merged away slide to where they joined, then go
  for (const t of result.absorbed) {
    const node = shown.get(t.id);
    if (!node) continue;
    shown.delete(t.id);
    place(node, t);
    setTimeout(() => node.remove(), SLIDE_MS);
  }
  const joined = new Set(result.merged);
  for (const t of result.game.tiles) {
    const node = shown.get(t.id);
    if (node) {
      node.className = tileClass(t.value);
      place(node, t);
    } else addTile(t, joined.has(t.id) ? "joined" : "");
  }
  const added = spawn(result.game);
  game = added ? added.game : result.game;
  if (added) addTile(added.tile, "fresh");
  best = Math.max(best, game.score);
  if (result.reachedNow) {
    board.classList.remove("made");
    void board.offsetWidth;
    board.classList.add("made");
  }
  drawNumbers();
  save();
}

function startOver(): void {
  game = newGame();
  moves = 0;
  save();
  drawAll();
}

// The only way to start over is the button in the top bar; with a game under way it asks first
newButton.addEventListener("click", () => {
  if (!canMove(game) || (moves === 0 && game.score === 0)) return startOver();
  confirmText.textContent = `This game ends here, with a score of ${game.score.toLocaleString("en-US")} and a top tile of ${highest(game).toLocaleString("en-US")}.`;
  confirmEl.hidden = false;
  confirmNo.focus();
});
confirmNo.addEventListener("click", () => {
  confirmEl.hidden = true;
});
confirmYes.addEventListener("click", () => {
  confirmEl.hidden = true;
  startOver();
});

const KEYS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down" };
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!confirmEl.hidden) {
    if (e.key === "Escape") confirmEl.hidden = true;
    return;
  }
  const dir = KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  act(dir);
});

// A swipe anywhere under the top bar; it counts as soon as the finger has gone far enough
let drag: { id: number; x: number; y: number } | null = null;
play.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
play.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  drag = null;
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
});
for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) play.addEventListener(type, () => (drag = null));
// Older Safari scrolls and bounces the page under a swipe unless the touch itself is refused
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

window.addEventListener("resize", fit);
window.addEventListener("orientationchange", fit);
if ("ResizeObserver" in window) new ResizeObserver(fit).observe(play);

drawAll();
fit();
save();
