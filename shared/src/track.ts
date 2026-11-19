// Track geometry shared by client and server.
// The track is a corridor of constant width around a centerline polyline.

export const LANES = 10;
export const LANE_W = 22;
export const TRACK_W = LANES * LANE_W;
export const HALF_W = TRACK_W / 2;
export const WORLD_W = 3200;
export const WORLD_H = 2000;

const CORNER_R = 160;
const CORNER_STEPS = 10;

// Corner waypoints of the centerline; corners are rounded with CORNER_R.
const WAY: [number, number][] = [
  [140, 240],
  [2960, 240],
  [2960, 700],
  [1700, 700],
  [1700, 1160],
  [2960, 1160],
  [2960, 1700],
  [240, 1700],
  [240, 760],
  // The last part curls in on itself like a letter G: east, down, then a hook back west to the finish.
  [1300, 760],
  [1300, 1100],
  [640, 1100],
];

function buildCenterline(): { x: number; y: number }[] {
  const out = [{ x: WAY[0][0], y: WAY[0][1] }];
  for (let i = 1; i < WAY.length - 1; i++) {
    const [ax, ay] = WAY[i - 1];
    const [bx, by] = WAY[i];
    const [cx, cy] = WAY[i + 1];
    let d1x = bx - ax, d1y = by - ay;
    const l1 = Math.hypot(d1x, d1y);
    d1x /= l1; d1y /= l1;
    let d2x = cx - bx, d2y = cy - by;
    const l2 = Math.hypot(d2x, d2y);
    d2x /= l2; d2y /= l2;
    const cross = d1x * d2y - d1y * d2x;
    const dot = Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y));
    const theta = Math.acos(dot);
    const t = CORNER_R * Math.tan(theta / 2);
    const sx = bx - d1x * t, sy = by - d1y * t;
    const sg = cross > 0 ? 1 : -1;
    const ox = sx - d1y * sg * CORNER_R, oy = sy + d1x * sg * CORNER_R;
    const a0 = Math.atan2(sy - oy, sx - ox);
    for (let j = 0; j <= CORNER_STEPS; j++) {
      const a = a0 + (sg * theta * j) / CORNER_STEPS;
      out.push({ x: ox + Math.cos(a) * CORNER_R, y: oy + Math.sin(a) * CORNER_R });
    }
  }
  const last = WAY[WAY.length - 1];
  out.push({ x: last[0], y: last[1] });
  return out;
}

export const CENTER = buildCenterline();
const N = CENTER.length - 1;
const SEG_LEN = new Float64Array(N);
const SEG_S = new Float64Array(N + 1);
for (let i = 0; i < N; i++) {
  SEG_LEN[i] = Math.hypot(CENTER[i + 1].x - CENTER[i].x, CENTER[i + 1].y - CENTER[i].y);
  SEG_S[i + 1] = SEG_S[i] + SEG_LEN[i];
}
export const TRACK_LEN = SEG_S[N];

// The start straight runs east along y = START_Y; the gate is the line x = GATE_X.
export const START_Y = WAY[0][1];
export const GATE_X = 800;
export const GATE_S = GATE_X - WAY[0][0];
export const FINISH_S = TRACK_LEN - 240;

/** Result of the last project() call (reused to avoid allocations). */
export const proj = { s: 0, d: 0, x: 0, y: 0 };

/** Projects a point onto the centerline: distance along it (s), distance from it (d), closest point (x, y). */
export function project(px: number, py: number): typeof proj {
  let best = Infinity;
  for (let i = 0; i < N; i++) {
    const a = CENTER[i], b = CENTER[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / (SEG_LEN[i] * SEG_LEN[i]);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const qx = a.x + dx * t, qy = a.y + dy * t;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < best) {
      best = d2;
      proj.s = SEG_S[i] + SEG_LEN[i] * t;
      proj.x = qx;
      proj.y = qy;
    }
  }
  proj.d = Math.sqrt(best);
  return proj;
}

/** Point and direction on the centerline at distance s. */
export function pointAt(s: number): { x: number; y: number; dx: number; dy: number } {
  s = Math.max(0, Math.min(TRACK_LEN, s));
  let i = 0;
  while (i < N - 1 && SEG_S[i + 1] < s) i++;
  const a = CENTER[i], b = CENTER[i + 1];
  const t = (s - SEG_S[i]) / SEG_LEN[i];
  const dx = (b.x - a.x) / SEG_LEN[i], dy = (b.y - a.y) / SEG_LEN[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx, dy };
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seededRandom = mulberry32;

// Starting grid: 10 lanes x 3 rows behind the gate.
export const GRID_ROWS = 3;
export const KART_COUNT = LANES * GRID_ROWS;
export function homeSlot(kart: number): { x: number; y: number } {
  const lane = kart % LANES;
  const row = Math.floor(kart / LANES);
  return {
    x: GATE_X - 30 - row * 32,
    y: START_Y - HALF_W + LANE_W / 2 + lane * LANE_W,
  };
}

/** A jump ramp: a rectangle starting at (x, y), running `len` along (dx, dy) and `hw` to each side. */
export interface Ramp { x: number; y: number; dx: number; dy: number; len: number; hw: number; lanes: number }
export const RAMP_LEN = 56;

// Places on straights where ramps can appear: a point on the centerline and the direction of travel.
// Each is far enough from the next corner for a jump to land on the straight.
const RAMP_STATIONS: { x: number; y: number; dx: number; dy: number }[] = [
  { x: 1500, y: 240, dx: 1, dy: 0 },
  { x: 2150, y: 240, dx: 1, dy: 0 },
  { x: 2300, y: 700, dx: -1, dy: 0 },
  { x: 2150, y: 1160, dx: 1, dy: 0 },
  { x: 2300, y: 1700, dx: -1, dy: 0 },
  { x: 1550, y: 1700, dx: -1, dy: 0 },
  { x: 850, y: 1700, dx: -1, dy: 0 },
  { x: 700, y: 760, dx: 1, dy: 0 },
];

// The second trap: a ramp on the left-hand straight that is walled in by cones, so nobody can drive onto it.
const BLOCKED_STATION = { x: 240, y: 1380, dx: 0, dy: -1 };
// A plain 3-lane ramp just before the finish line, always there.
const FINISH_STATION = { x: 1052, y: 1100, dx: -1, dy: 0 };
const FINISH_LANES = 3;
const BLOCKED_LANES = 4;
/** Index of the walled-in ramp in RAMPS (it is always the last one). */
export let blockedRamp = -1;

/** Cones closing off a ramp: two staggered rows across its foot and a line down each side. */
function wallCones(r: Ramp): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const at = (u: number, v: number) => out.push({ x: r.x + r.dx * u - r.dy * v, y: r.y + r.dy * u + r.dx * v });
  const edge = r.hw + 6;
  [-10, -23].forEach((u, row) => {
    for (let v = -edge + (row % 2) * (TRAP_CONE_GAP / 2); v <= edge; v += TRAP_CONE_GAP) at(u, v);
  });
  for (let u = 3; u <= r.len; u += TRAP_CONE_GAP) { at(u, -edge); at(u, edge); }
  return out;
}

/** Ramp layouts for one station, as lane widths, with how likely each is. An empty list means no ramp. */
const RAMP_LAYOUTS: { widths: number[]; weight: number }[] = [
  { widths: [], weight: 0.12 },
  { widths: [4], weight: 0.2 },
  { widths: [3], weight: 0.2 },
  { widths: [2], weight: 0.14 },
  { widths: [2, 2], weight: 0.22 },
  { widths: [2, 3], weight: 0.06 },
  { widths: [3, 2], weight: 0.06 },
];

/** Current ramps. Replaced by setRamps(); both sides must use the same seed. */
export let RAMPS: Ramp[] = [];
export let rampSeed = 0;
/** Cones on the track: the fixed ones plus the wall of cones behind the trap ramp. */
export let CONES: { x: number; y: number }[] = [];

// The trap: one 4-lane ramp per layout has rows of cones right where a jump from it lands.
const TRAP_LANES = 4;
/** Distance from the start of the ramp to each row of trap cones; a jump lands just before the first. */
const TRAP_ROWS = [288, 302, 316];
const TRAP_CONE_GAP = 13;

function trapCones(r: Ramp): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  TRAP_ROWS.forEach((u, row) => {
    // Alternate rows are shifted by half a gap so there is no straight path through.
    for (let v = -r.hw + 5 + (row % 2) * (TRAP_CONE_GAP / 2); v <= r.hw - 5; v += TRAP_CONE_GAP) {
      out.push({ x: r.x + r.dx * u - r.dy * v, y: r.y + r.dy * u + r.dx * v });
    }
  });
  return out;
}

/** Generates the ramp layout for a seed: each station gets one ramp, two ramps or none, in random lanes. */
export function setRamps(seed: number): void {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const out: Ramp[] = [];
  const trapStation = RAMP_STATIONS[int(RAMP_STATIONS.length)];
  let trap: Ramp | null = null;
  for (const st of RAMP_STATIONS) {
    let roll = rnd();
    let layout = RAMP_LAYOUTS[0];
    for (const l of RAMP_LAYOUTS) {
      layout = l;
      if ((roll -= l.weight) < 0) break;
    }
    const w = st === trapStation ? [TRAP_LANES] : layout.widths;
    // First lane of each ramp; two ramps keep at least one free lane between them.
    const starts: number[] = [];
    if (w.length === 1) starts.push(int(LANES - w[0] + 1));
    else if (w.length === 2) {
      const slack = LANES - w[0] - w[1] - 1;
      const first = int(slack + 1);
      starts.push(first, first + w[0] + 1 + int(slack - first + 1));
    }
    w.forEach((lanes, i) => {
      const off = (starts[i] + lanes / 2) * LANE_W - HALF_W;
      const r: Ramp = {
        x: st.x - st.dy * off, y: st.y + st.dx * off,
        dx: st.dx, dy: st.dy, len: RAMP_LEN, hw: (lanes * LANE_W) / 2, lanes,
      };
      out.push(r);
      if (st === trapStation) trap = r;
    });
  }
  // Two fixed places, each in random lanes: the plain ramp before the finish and the walled-in ramp.
  const fixed = (st: { x: number; y: number; dx: number; dy: number }, lanes: number): Ramp => {
    const off = (int(LANES - lanes + 1) + lanes / 2) * LANE_W - HALF_W;
    return {
      x: st.x - st.dy * off, y: st.y + st.dx * off,
      dx: st.dx, dy: st.dy, len: RAMP_LEN, hw: (lanes * LANE_W) / 2, lanes,
    };
  };
  out.push(fixed(FINISH_STATION, FINISH_LANES));
  const blocked = fixed(BLOCKED_STATION, BLOCKED_LANES);
  out.push(blocked);
  blockedRamp = out.length - 1;

  RAMPS = out;
  CONES = [...BASE_CONES, ...(trap ? trapCones(trap) : []), ...wallCones(blocked)];
  rampSeed = seed;
}

/** The ramp covering the point, or null. */
export function rampAt(x: number, y: number): Ramp | null {
  for (const r of RAMPS) {
    const px = x - r.x, py = y - r.y;
    const u = px * r.dx + py * r.dy;
    const v = -px * r.dy + py * r.dx;
    if (u >= 0 && u <= r.len && v >= -r.hw && v <= r.hw) return r;
  }
  return null;
}

/** True from just before any ramp station to past where a jump lands, across the whole track width; fixed cones are kept out. */
function nearRampStation(x: number, y: number): boolean {
  return [...RAMP_STATIONS, BLOCKED_STATION, FINISH_STATION].some((st) => {
    const u = (x - st.x) * st.dx + (y - st.y) * st.dy;
    const v = -(x - st.x) * st.dy + (y - st.y) * st.dx;
    return u >= -45 && u <= 360 && Math.abs(v) <= HALF_W;
  });
}

// Fixed cone obstacles along the track.
const BASE_CONES: { x: number; y: number }[] = (() => {
  const rnd = mulberry32(7);
  const out: { x: number; y: number }[] = [];
  for (let s = GATE_S + 420; s < FINISH_S - 200; s += 230 + rnd() * 120) {
    const count = rnd() < 0.4 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const p = pointAt(s + c * 30);
      const off = (rnd() * 2 - 1) * (HALF_W - 18);
      const cone = { x: p.x - p.dy * off, y: p.y + p.dx * off };
      if (!nearRampStation(cone.x, cone.y)) out.push(cone);
    }
  }
  return out;
})();

setRamps(1);

export const SPAWN = { x: 170, y: START_Y, w: 80, h: 150 };
