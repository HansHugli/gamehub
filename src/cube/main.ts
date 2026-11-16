import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { lockPage, stored } from "../shell.ts";
import { DX, DY, EAST, LETTERS, NORTH, RECIPES, SOUTH, TOP, UNDER, WEST, ahead, begin, makeLevel, replay, roll, showing, solve, solved, tally, type Dir, type Level, type State } from "./game.ts";

const SAVE_KEY = "gamehub.cube.game.v1";
const PROGRESS_KEY = "gamehub.cube.progress.v1";

/** The level under way: its number, the rolls made so far, and how many of them were shown. */
interface Play {
  n: number;
  rolls: string;
  shown: number;
}
/** The best a level has been done in. A solve with no roll shown beats one with. */
interface Best {
  rolls: number;
  aided: boolean;
}

/** Paint colours by number; 0 is no paint. */
const PAINT = ["", "#e5484d", "#3b6fe0", "#f2c94c", "#2f9e5b", "#f08a24", "#9257e0"];
const DIR_WORDS = ["up", "right", "down", "left"];
const DIR_ARROWS = ["↑", "→", "↓", "←"];

const CUBE = 0.7;
const HALF = CUBE / 2;
const TILE = 0.8;
/** The camera stands to the south, a little to the east, looking down at the floor. */
const YAW = (14 * Math.PI) / 180;
const LIFT = (54 * Math.PI) / 180;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}
const stageEl = el("stage");
const canvas = el<HTMLCanvasElement>("view");
const statusEl = el("status");
const netEl = el("net");
const toolsEl = el("tools");
const afterEl = el("after");
const undoButton = el<HTMLButtonElement>("undo");
const hintButton = el<HTMLButtonElement>("hint");
const chooserEl = el("chooser");
const chooserText = el("chooser-text");
const levelsEl = el("levels");
const rulesEl = el("rules");

lockPage();

// ---------- what is kept between visits ----------

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
function readProgress(): Map<number, Best> {
  const kept = new Map<number, Best>();
  const raw = read(PROGRESS_KEY);
  if (!raw || typeof raw !== "object") return kept;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(key);
    const best = value as Partial<Best> | null;
    if (whole(n) && n >= 1 && best && whole(best.rolls)) kept.set(n, { rolls: best.rolls, aided: best.aided === true });
  }
  return kept;
}
function readPlay(): Play | null {
  const p = read(SAVE_KEY) as Partial<Play> | null;
  if (!p || !whole(p.n) || p.n < 1 || p.n > 100000 || typeof p.rolls !== "string" || p.rolls.length > 5000) return null;
  if (!replay(makeLevel(p.n), p.rolls)) return null;
  return { n: p.n, rolls: p.rolls, shown: whole(p.shown) ? p.shown : 0 };
}

const progress = readProgress();
let play: Play = readPlay() ?? { n: firstUnsolved(), rolls: "", shown: 0 };
let level: Level = makeLevel(play.n);
let state: State = replay(level, play.rolls) ?? begin(level);
/** Text that stands in for the usual status line until the next roll. */
let note = "";

function firstUnsolved(): number {
  let n = 1;
  while (progress.has(n)) n++;
  return n;
}
function save(): void {
  stored.set(SAVE_KEY, JSON.stringify(play));
  stored.set(PROGRESS_KEY, JSON.stringify(Object.fromEntries(progress)));
}
function count(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

// ---------- the scene ----------

const scene = new Scene();
const camera = new PerspectiveCamera(32, 1, 0.1, 200);
const floorGroup = new Group();
scene.add(floorGroup);
scene.add(new AmbientLight(0xffffff, 1.5));
const sun = new DirectionalLight(0xffffff, 2.2);
sun.position.set(3.5, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -5;
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 5;
sun.shadow.camera.bottom = -5;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun);

const tileShape = new RoundedBoxGeometry(TILE, 0.16, TILE, 3, 0.045);
const rimShape = new RoundedBoxGeometry(0.97, 0.12, 0.97, 3, 0.045);
const cubeShape = new RoundedBoxGeometry(CUBE, CUBE, CUBE, 4, 0.07);
// A box's sides are drawn in the order east, west, top, under, south, north
const SIDE_PLACES = [EAST, WEST, TOP, UNDER, SOUTH, NORTH];
const cubeSides = SIDE_PLACES.map(() => new MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 }));
const cube = new Mesh(cubeShape, cubeSides);
cube.castShadow = true;
scene.add(cube);

interface Tile {
  group: Group;
  top: MeshStandardMaterial;
  rim: MeshStandardMaterial;
}
/** By cell; null where there is no tile. */
let tiles: (Tile | null)[] = [];

let renderer: WebGLRenderer | null = null;
try {
  renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
} catch {
  el("nogl").hidden = false;
  canvas.hidden = true;
}

const lightScheme = window.matchMedia("(prefers-color-scheme: light)");
function blankColour(): string {
  return lightScheme.matches ? "#c9d1de" : "#4a5673";
}
function plainRim(): string {
  return lightScheme.matches ? "#a9b3c5" : "#283246";
}

function cellX(cell: number): number {
  return (cell % level.w) - (level.w - 1) / 2;
}
function cellZ(cell: number): number {
  return Math.floor(cell / level.w) - (level.h - 1) / 2;
}

function buildFloor(): void {
  for (const tile of tiles) {
    if (!tile) continue;
    tile.top.dispose();
    tile.rim.dispose();
  }
  floorGroup.clear();
  tiles = level.floor.map((there, cell) => {
    if (!there) return null;
    const group = new Group();
    group.position.set(cellX(cell), 0, cellZ(cell));
    const top = new MeshStandardMaterial({ roughness: 0.7 });
    const rim = new MeshStandardMaterial({ roughness: 0.7 });
    const topMesh = new Mesh(tileShape, top);
    topMesh.position.y = -0.08;
    topMesh.receiveShadow = true;
    const rimMesh = new Mesh(rimShape, rim);
    rimMesh.position.y = -0.11;
    rimMesh.receiveShadow = true;
    group.add(rimMesh, topMesh);
    floorGroup.add(group);
    return { group, top, rim };
  });
  paintFloor();
  fit();
}

function paintFloor(): void {
  tiles.forEach((tile, cell) => {
    if (!tile) return;
    const paint = state.paint[cell] ?? 0;
    const want = level.want[cell] ?? 0;
    tile.top.color.set(paint === 0 ? blankColour() : PAINT[paint]!);
    tile.rim.color.set(want === 0 ? plainRim() : PAINT[want]!);
  });
}

function restCube(): void {
  const colours = showing(level, state);
  SIDE_PLACES.forEach((place, side) => cubeSides[side]!.color.set(PAINT[colours[place]!]!));
  cube.quaternion.identity();
  cube.position.set(cellX(state.at), HALF, cellZ(state.at));
}

/** Where the camera looks, and how far back it must stand for the whole floor to be in sight. */
const aim = new Vector3(0, 0.15, 0);
function stand(distance: number): void {
  camera.position.set(aim.x + distance * Math.sin(YAW) * Math.cos(LIFT), aim.y + distance * Math.sin(LIFT), aim.z + distance * Math.cos(YAW) * Math.cos(LIFT));
  camera.lookAt(aim);
  camera.updateMatrixWorld();
}
/** The floor's corners at tile height and at the height of the cube's top, as seen on screen (-1 to 1). */
function seen(): { left: number; right: number; top: number; bottom: number } {
  const box = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity };
  const point = new Vector3();
  for (const x of [-level.w / 2, level.w / 2]) {
    for (const z of [-level.h / 2, level.h / 2]) {
      for (const y of [-0.17, CUBE + 0.25]) {
        point.set(x, y, z).project(camera);
        box.left = Math.min(box.left, point.x);
        box.right = Math.max(box.right, point.x);
        box.top = Math.max(box.top, point.y);
        box.bottom = Math.min(box.bottom, point.y);
      }
    }
  }
  return box;
}
function fit(): void {
  aim.set(0, 0.15, 0);
  let distance = 60;
  for (let pass = 0; pass < 3; pass++) {
    let near = 2;
    let far = 90;
    for (let i = 0; i < 22; i++) {
      const mid = (near + far) / 2;
      stand(mid);
      const box = seen();
      if (box.right - box.left <= 1.84 && box.top - box.bottom <= 1.8) far = mid;
      else near = mid;
    }
    distance = far;
    stand(distance);
    // Slide the aim so the floor sits in the middle of the stage, not above or below it
    const box = seen();
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const halfHigh = Math.tan((camera.fov * Math.PI) / 360) * distance;
    aim.addScaledVector(up, ((box.top + box.bottom) / 2) * halfHigh);
    aim.addScaledVector(right, ((box.left + box.right) / 2) * halfHigh * camera.aspect);
  }
  stand(distance);
  sun.target.position.copy(aim);
  sun.target.updateMatrixWorld();
}

function resize(): void {
  const width = Math.max(1, Math.floor(stageEl.clientWidth));
  const height = Math.max(1, Math.floor(stageEl.clientHeight));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
  }
  fit();
  draw();
}

function draw(): void {
  if (renderer) renderer.render(scene, camera);
}

// ---------- movement over time ----------

interface Motion {
  from: number;
  ms: number;
  step: (t: number) => void;
  done?: () => void;
}
let motions: Motion[] = [];
let frame = 0;
const stillness = window.matchMedia("(prefers-reduced-motion: reduce)");

function move(ms: number, step: (t: number) => void, done?: () => void): void {
  motions.push({ from: performance.now(), ms: stillness.matches ? 0 : ms, step, done });
  if (frame === 0) frame = requestAnimationFrame(tick);
}
function tick(now: number): void {
  frame = 0;
  const running = motions;
  motions = [];
  const finished: Motion[] = [];
  for (const m of running) {
    const t = m.ms <= 0 ? 1 : Math.min(1, Math.max(0, (now - m.from) / m.ms));
    m.step(t);
    if (t >= 1) finished.push(m);
    else motions.push(m);
  }
  // A finished motion may start the next one, so these run after the list is settled
  for (const m of finished) m.done?.();
  draw();
  if (motions.length > 0 && frame === 0) frame = requestAnimationFrame(tick);
}
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// ---------- playing ----------

/** True while the cube is on its way; a swipe made meanwhile waits its turn. */
let rolling = false;
let waiting: Dir | null = null;
const turnAxis = new Vector3();
const turned = new Quaternion();
const arm = new Vector3();

function dialogOpen(): boolean {
  return !chooserEl.hidden || !rulesEl.hidden;
}

function tryRoll(dir: Dir): void {
  if (dialogOpen()) return;
  if (rolling) {
    waiting = dir;
    return;
  }
  if (solved(level, state)) return;
  const next = roll(level, state, dir);
  const fromX = cellX(state.at);
  const fromZ = cellZ(state.at);
  const dx = DX[dir]!;
  const dz = DY[dir]!;
  turnAxis.set(dz, 0, -dx);
  if (!next) {
    // No tile that way: the cube leans over its edge and settles back
    rolling = true;
    move(
      220,
      (t) => tip(fromX, fromZ, dx, dz, Math.sin(t * Math.PI) * 0.16, 0),
      () => {
        rolling = false;
        restCube();
        runWaiting();
      },
    );
    return;
  }
  rolling = true;
  note = "";
  play.rolls += LETTERS[dir];
  state = next;
  save();
  move(
    170,
    (t) => tip(fromX, fromZ, dx, dz, (ease(t) * Math.PI) / 2, ease(t)),
    () => {
      rolling = false;
      restCube();
      paintFloor();
      press(state.at);
      show();
      if (solved(level, state)) {
        waiting = null;
        finish();
      } else runWaiting();
    },
  );
}
function runWaiting(): void {
  const dir = waiting;
  waiting = null;
  if (dir !== null) tryRoll(dir);
}

/**
 * The cube part-way through a roll: turned by `angle` about the edge it rolls over. The cube
 * is narrower than a tile, so that edge also slides forward as it goes (`slid`, 0 to 1).
 */
function tip(fromX: number, fromZ: number, dx: number, dz: number, angle: number, slid: number): void {
  turned.setFromAxisAngle(turnAxis, angle);
  arm.set(-dx * HALF, HALF, -dz * HALF).applyQuaternion(turned);
  const edge = HALF + slid * (1 - CUBE);
  cube.position.set(fromX + dx * edge + arm.x, arm.y, fromZ + dz * edge + arm.z);
  cube.quaternion.copy(turned);
}

/** A tile gives a little under the stamp. */
function press(cell: number): void {
  const tile = tiles[cell];
  if (!tile) return;
  move(200, (t) => {
    tile.group.position.y = -0.07 * Math.sin(t * Math.PI);
  });
}
/** A tile rises twice, to point it out. */
function beckon(cell: number): void {
  const tile = tiles[cell];
  if (!tile) return;
  move(900, (t) => {
    tile.group.position.y = 0.12 * Math.abs(Math.sin(t * Math.PI * 2));
  });
}

function finish(): void {
  const aided = play.shown > 0;
  const rolls = play.rolls.length;
  const best = progress.get(level.n);
  if (!best || (best.aided && !aided) || (best.aided === aided && rolls < best.rolls)) progress.set(level.n, { rolls, aided });
  save();
  show();
  // The cube hops and spins once
  const x = cellX(state.at);
  const z = cellZ(state.at);
  rolling = true;
  move(
    620,
    (t) => {
      cube.position.set(x, HALF + 0.55 * Math.sin(t * Math.PI), z);
      cube.rotation.set(0, ease(t) * Math.PI * 2, 0);
    },
    () => {
      rolling = false;
      restCube();
    },
  );
}

function undo(): void {
  if (rolling || play.rolls.length === 0) return;
  play.rolls = play.rolls.slice(0, -1);
  state = replay(level, play.rolls) ?? begin(level);
  note = "";
  waiting = null;
  save();
  restCube();
  paintFloor();
  show();
  draw();
}

function hint(): void {
  if (rolling || solved(level, state)) return;
  const answer = solve(level, state);
  const dir = answer?.[0];
  if (dir === undefined) return;
  play.shown++;
  save();
  note = `Roll ${DIR_WORDS[dir]} ${DIR_ARROWS[dir]}`;
  beckon(ahead(level, state.at, dir));
  show();
}

function startLevel(n: number): void {
  motions = [];
  rolling = false;
  waiting = null;
  note = "";
  play = { n, rolls: "", shown: 0 };
  level = makeLevel(n);
  state = begin(level);
  save();
  buildFloor();
  restCube();
  show();
  draw();
}

// ---------- the page around the scene ----------

function show(): void {
  const rolls = play.rolls.length;
  const done = solved(level, state);
  const { right, asked } = tally(level, state);
  let text: string;
  if (done) {
    const how = rolls === level.par ? `Done in ${count(rolls, "roll")}, which is par.` : rolls < level.par ? `Done in ${count(rolls, "roll")}.` : `Done in ${count(rolls, "roll")}. Par is ${level.par}.`;
    text = play.shown > 0 ? `${how} ${count(play.shown, "roll")} shown.` : how;
  } else if (note) {
    text = note;
  } else if (rolls === 0) {
    text = level.n === 1 ? "Swipe to roll the cube. Fill the rimmed tile with its colour." : `Level ${level.n}. Par is ${count(level.par, "roll")}.`;
  } else {
    text = `Level ${level.n}. ${right} of ${count(asked, "tile")} right. ${count(rolls, "roll")}, par ${level.par}.`;
  }
  statusEl.textContent = text;
  statusEl.classList.toggle("good", done);
  toolsEl.hidden = done;
  afterEl.hidden = !done;
  undoButton.disabled = rolls === 0;
  hintButton.disabled = done;

  const colours = showing(level, state);
  for (const face of netEl.querySelectorAll<HTMLElement>("i")) {
    const place = Number(face.dataset["place"]);
    face.className = `c${colours[place]}`;
  }
}

function openChooser(): void {
  const shownLevels = Math.max(RECIPES.length, play.n, ...progress.keys()) + 1;
  levelsEl.textContent = "";
  for (let n = 1; n <= shownLevels; n++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = String(n);
    const best = progress.get(n);
    const atPar = best !== undefined && !best.aided && best.rolls <= makeLevelPar(n);
    if (best) button.classList.add(atPar ? "par" : "done");
    if (n === play.n) button.classList.add("here");
    button.setAttribute("aria-label", `Level ${n}${best ? (atPar ? ", done at par" : ", done") : ""}${n === play.n ? ", the one you are on" : ""}`);
    button.dataset["level"] = String(n);
    levelsEl.append(button);
  }
  const doneCount = progress.size;
  chooserText.textContent = `${count(doneCount, "level")} done. A filled one was done at par with no roll shown. Picking a level leaves the one you are on.`;
  el<HTMLButtonElement>("restart").disabled = play.rolls.length === 0;
  chooserEl.hidden = false;
  levelsEl.querySelector(".here")?.scrollIntoView({ block: "center" });
}
/** A level's par is only known once the level is made; done levels have been, so this is cheap for them. */
function makeLevelPar(n: number): number {
  return makeLevel(n).par;
}

levelsEl.addEventListener("click", (e) => {
  const button = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-level]") : null;
  if (!button) return;
  chooserEl.hidden = true;
  startLevel(Number(button.dataset["level"]));
});
el("levels-open").addEventListener("click", openChooser);
el("chooser-no").addEventListener("click", () => (chooserEl.hidden = true));
el("restart").addEventListener("click", () => {
  chooserEl.hidden = true;
  startLevel(play.n);
});
el("rules-open").addEventListener("click", () => (rulesEl.hidden = false));
el("rules-close").addEventListener("click", () => (rulesEl.hidden = true));
el("next").addEventListener("click", () => startLevel(play.n + 1));
undoButton.addEventListener("click", undo);
hintButton.addEventListener("click", hint);

// ---------- swipes and keys ----------

/** The roll whose path across the screen lies closest to a swipe. */
function dirOfSwipe(dx: number, dy: number): Dir {
  const origin = new Vector3(0, 0, 0).project(camera);
  let best: Dir = 0;
  let bestDot = -Infinity;
  for (const d of [0, 1, 2, 3] as const) {
    const p = new Vector3(DX[d]!, 0, DY[d]!).project(camera);
    const sx = (p.x - origin.x) * camera.aspect;
    const sy = -(p.y - origin.y);
    const dot = (sx * dx + sy * dy) / Math.hypot(sx, sy);
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return best;
}

let touch: { id: number; x: number; y: number; used: boolean } | null = null;
stageEl.addEventListener("pointerdown", (e) => {
  if (touch) return;
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
  try {
    stageEl.setPointerCapture(e.pointerId);
  } catch {
    /* the swipe still works while the finger stays over the stage */
  }
});
stageEl.addEventListener("pointermove", (e) => {
  if (!touch || touch.id !== e.pointerId || touch.used) return;
  const dx = e.clientX - touch.x;
  const dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < 22) return;
  touch.used = true;
  tryRoll(dirOfSwipe(dx, dy));
});
function endTouch(e: PointerEvent): void {
  if (touch && touch.id === e.pointerId) touch = null;
}
stageEl.addEventListener("pointerup", endTouch);
stageEl.addEventListener("pointercancel", endTouch);
// Safari scrolls or bounces the page on a touch that is not refused outright
stageEl.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

const KEYS: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || dialogOpen()) return;
  const dir = KEYS[e.key];
  if (dir !== undefined) {
    e.preventDefault();
    tryRoll(dir);
  } else if (e.key === "Backspace" || e.key === "z" || e.key === "u") {
    e.preventDefault();
    undo();
  }
});

// ---------- start ----------

lightScheme.addEventListener("change", () => {
  paintFloor();
  draw();
});
canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
canvas.addEventListener("webglcontextrestored", draw);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) draw();
});
new ResizeObserver(resize).observe(stageEl);

buildFloor();
restCube();
show();
save();
resize();
