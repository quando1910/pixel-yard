// Deterministic simulation shared by server (authoritative) and client (prediction).
import { CONES, GATE_X, HALF_W, KART_COUNT, homeSlot, project, rampAt } from "./track";

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const STEP_MS = 1000 / TICK_RATE;

export const WALK_SPEED = 80;
export const KART_MAX = 210;
export const KART_ACCEL = 300;
export const KART_DRAG = 170;
export const KART_IDLE_DRAG = 420;

/** Speed a kart flies at after a ramp, and how long it stays in the air. */
export const JUMP_SPEED = 340;
export const JUMP_TICKS = 24;
/** A kart must be going at least this fast up the ramp to take off. */
const RAMP_MIN_SPEED = 90;

export const KART_R = 9;
export const WALK_R = 5;
export const CONE_R = 5;
export const MOUNT_DIST = 26;

const KART_BOUNCE = 0.7;
const CONE_BOUNCE = 0.6;
const WALL_BOUNCE = 0.4;
const GATE_BOUNCE = 0.4;
/** How hard a kart throws a walker it hits, relative to the closing speed. */
const KNOCK_FACTOR = 1.5;
const KNOCK_MAX = 330;
/** How fast a thrown walker slows down. */
const KNOCK_DRAG = 520;
/** Share of the closing speed the kart loses when it hits a walker. */
const KART_HIT_LOSS = 0.2;
/** Karts slower than this do not block walkers, so people can walk between parked karts to reach one. */
const KART_HIT_MIN_SPEED = 20;

export interface Player {
  id: number;
  x: number;
  y: number;
  /** Knockback velocity from being hit by a kart; zero when walking normally. */
  vx: number;
  vy: number;
  /** Input direction, each -1, 0 or 1. */
  ix: number;
  iy: number;
  /** Index of the kart being driven, or -1 when walking. */
  kart: number;
}

export interface Kart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks left in the air after a ramp; 0 when on the ground. */
  air: number;
}

export class World {
  players = new Map<number, Player>();
  karts: Kart[] = [];
  gateOpen = false;
  private drivers: (Player | null)[] = [];

  constructor() {
    for (let k = 0; k < KART_COUNT; k++) {
      const h = homeSlot(k);
      this.karts.push({ x: h.x, y: h.y, vx: 0, vy: 0, air: 0 });
      this.drivers.push(null);
    }
  }

  resetKart(k: number): void {
    const h = homeSlot(k);
    const kart = this.karts[k];
    kart.x = h.x; kart.y = h.y; kart.vx = 0; kart.vy = 0; kart.air = 0;
  }

  /** Nearest kart without a driver within MOUNT_DIST of the point, or -1. */
  nearestFreeKart(x: number, y: number): number {
    const taken = new Set<number>();
    for (const p of this.players.values()) if (p.kart >= 0) taken.add(p.kart);
    let best = -1, bestD = MOUNT_DIST * MOUNT_DIST;
    for (let k = 0; k < this.karts.length; k++) {
      if (taken.has(k)) continue;
      const dx = this.karts[k].x - x, dy = this.karts[k].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = k; }
    }
    return best;
  }

  step(): void {
    const karts = this.karts;
    const drivers = this.drivers;
    drivers.fill(null);
    for (const p of this.players.values()) if (p.kart >= 0) drivers[p.kart] = p;

    // Kart acceleration and movement.
    for (let k = 0; k < karts.length; k++) {
      const kart = karts[k];
      const p = drivers[k];
      if (kart.air > 0) {
        // In the air: no steering, no drag.
        kart.air--;
      } else if (p && (p.ix !== 0 || p.iy !== 0)) {
        const len = Math.hypot(p.ix, p.iy);
        const dvx = (p.ix / len) * KART_MAX - kart.vx;
        const dvy = (p.iy / len) * KART_MAX - kart.vy;
        const d = Math.hypot(dvx, dvy);
        const a = KART_ACCEL * DT;
        if (d <= a) { kart.vx += dvx; kart.vy += dvy; }
        else { kart.vx += (dvx / d) * a; kart.vy += (dvy / d) * a; }
      } else {
        const sp = Math.hypot(kart.vx, kart.vy);
        const dec = (p ? KART_DRAG : KART_IDLE_DRAG) * DT;
        if (sp <= dec) { kart.vx = 0; kart.vy = 0; }
        else { const f = (sp - dec) / sp; kart.vx *= f; kart.vy *= f; }
      }
      kart.x += kart.vx * DT;
      kart.y += kart.vy * DT;
      // Driving up a ramp fast enough launches the kart straight ahead at jump speed.
      if (kart.air === 0) {
        const r = rampAt(kart.x, kart.y);
        if (r && kart.vx * r.dx + kart.vy * r.dy > RAMP_MIN_SPEED) {
          kart.air = JUMP_TICKS;
          kart.vx = r.dx * JUMP_SPEED;
          kart.vy = r.dy * JUMP_SPEED;
        }
      }
    }

    // Kart against kart: push apart and bounce.
    const minD = KART_R * 2;
    for (let i = 0; i < karts.length; i++) {
      const a = karts[i];
      if (a.air > 0) continue; // flying karts pass over everything
      for (let j = i + 1; j < karts.length; j++) {
        const b = karts[j];
        if (b.air > 0) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        const nx = dx / d, ny = dy / d;
        const push = (minD - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const imp = (-(1 + KART_BOUNCE) * vn) / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
        }
      }
    }

    for (let k = 0; k < karts.length; k++) {
      const kart = karts[k];
      // Cones.
      const cd = KART_R + CONE_R;
      for (let c = 0; kart.air === 0 && c < CONES.length; c++) {
        const dx = kart.x - CONES[c].x, dy = kart.y - CONES[c].y;
        if (dx > cd || dx < -cd || dy > cd || dy < -cd) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= cd * cd || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        kart.x = CONES[c].x + nx * cd;
        kart.y = CONES[c].y + ny * cd;
        const vn = kart.vx * nx + kart.vy * ny;
        if (vn < 0) { kart.vx -= (1 + CONE_BOUNCE) * vn * nx; kart.vy -= (1 + CONE_BOUNCE) * vn * ny; }
      }
      // Track walls.
      const pr = project(kart.x, kart.y);
      const limit = HALF_W - KART_R;
      if (pr.d > limit) {
        const nx = (kart.x - pr.x) / pr.d, ny = (kart.y - pr.y) / pr.d;
        kart.x = pr.x + nx * limit;
        kart.y = pr.y + ny * limit;
        const vn = kart.vx * nx + kart.vy * ny;
        if (vn > 0) { kart.vx -= (1 + WALL_BOUNCE) * vn * nx; kart.vy -= (1 + WALL_BOUNCE) * vn * ny; }
      }
      // Start gate.
      if (!this.gateOpen) {
        if (kart.x < GATE_X && kart.x > GATE_X - KART_R) {
          kart.x = GATE_X - KART_R;
          if (kart.vx > 0) kart.vx *= -GATE_BOUNCE;
        } else if (kart.x >= GATE_X && kart.x < GATE_X + KART_R) {
          kart.x = GATE_X + KART_R;
          if (kart.vx < 0) kart.vx *= -GATE_BOUNCE;
        }
      }
    }

    // Players: drivers follow their kart, walkers move directly.
    for (const p of this.players.values()) {
      if (p.kart >= 0) {
        p.x = karts[p.kart].x;
        p.y = karts[p.kart].y;
        p.vx = 0; p.vy = 0;
        continue;
      }
      if (p.ix !== 0 || p.iy !== 0) {
        const len = Math.hypot(p.ix, p.iy);
        p.x += (p.ix / len) * WALK_SPEED * DT;
        p.y += (p.iy / len) * WALK_SPEED * DT;
      }
      if (p.vx !== 0 || p.vy !== 0) {
        p.x += p.vx * DT;
        p.y += p.vy * DT;
        const sp = Math.hypot(p.vx, p.vy);
        const dec = KNOCK_DRAG * DT;
        if (sp <= dec) { p.vx = 0; p.vy = 0; }
        else { const f = (sp - dec) / sp; p.vx *= f; p.vy *= f; }
      }
      // Karts are heavy: a walker is pushed out of the way, and thrown if the kart is moving into them.
      const hit = KART_R + WALK_R;
      for (let k = 0; k < karts.length; k++) {
        const kart = karts[k];
        if (kart.air > 0 || kart.vx * kart.vx + kart.vy * kart.vy < KART_HIT_MIN_SPEED * KART_HIT_MIN_SPEED) continue;
        let dx = p.x - kart.x, dy = p.y - kart.y;
        if (dx > hit || dx < -hit || dy > hit || dy < -hit) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= hit * hit) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
        const nx = dx / d, ny = dy / d;
        p.x = kart.x + nx * hit;
        p.y = kart.y + ny * hit;
        const vn = (kart.vx - p.vx) * nx + (kart.vy - p.vy) * ny;
        if (vn > 0) {
          p.vx += nx * vn * KNOCK_FACTOR;
          p.vy += ny * vn * KNOCK_FACTOR;
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > KNOCK_MAX) { p.vx *= KNOCK_MAX / sp; p.vy *= KNOCK_MAX / sp; }
          kart.vx -= nx * vn * KART_HIT_LOSS;
          kart.vy -= ny * vn * KART_HIT_LOSS;
        }
      }
      const pr = project(p.x, p.y);
      const limit = HALF_W - WALK_R;
      if (pr.d > limit) {
        p.x = pr.x + ((p.x - pr.x) / pr.d) * limit;
        p.y = pr.y + ((p.y - pr.y) / pr.d) * limit;
      }
      if (!this.gateOpen) {
        if (p.x < GATE_X && p.x > GATE_X - WALK_R) p.x = GATE_X - WALK_R;
        else if (p.x >= GATE_X && p.x < GATE_X + WALK_R) p.x = GATE_X + WALK_R;
      }
    }
  }
}
