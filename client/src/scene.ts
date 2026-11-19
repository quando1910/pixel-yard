import Phaser from "phaser";
import {
  C, CONES, FINISH_S, JUMP_TICKS, GATE_S, GATE_X, HALF_W, KART_ACCEL, DT, K_STRIDE, LANES, P_STRIDE, SPAWN, START_Y,
  RAMPS, STEP_MS, WORLD_H, WORLD_W, World, project, rampSeed, setRamps,
  type Phase, type SnapshotMsg,
} from "@race/shared";
import { buildTextures, RAMP_ORIGIN_X, KART_BACK, KART_FRONT, KART_SEAT, KART_SIDE, SHIRT_COLORS, VIEW_BACK, VIEW_FRONT, VIEW_SIDE } from "./art";
import { audio } from "./audio";
import { readDirection, setActionHandler } from "./input";
import type { Net } from "./net";
import * as ui from "./ui";

/** Corrections larger than this are shown instantly (teleports) instead of being smoothed. */
const SNAP_DIST = 70;
const SMOOTH_MS = 90;
/** How high a jumping kart is drawn above the ground at the top of its arc. */
const JUMP_HEIGHT = 20;
/** Walk cycle: step, stand, other step, stand. */
const WALK_FRAMES = [1, 0, 2, 0];
const WALK_FRAME_MS = 120;
const ZOOM_KEY = "zoom";
/** Limits of the user's zoom multiplier, relative to the zoom that fits the window. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.5;

interface View {
  /** Position at the previous simulation tick, for interpolation between ticks. */
  px: number;
  py: number;
  /** Visual offset that hides server corrections; decays to zero. */
  ox: number;
  oy: number;
  /** Position drawn this frame. */
  rx: number;
  ry: number;
}

interface KartView extends View {
  img: Phaser.GameObjects.Image;
  /** The driver, drawn from the waist up on top of the kart. */
  driver: Phaser.GameObjects.Image;
  /** The kart's lower part, drawn over the driver. */
  front: Phaser.GameObjects.Image;
  /** KART_FRONT, KART_SIDE or KART_BACK; the side view is flipped when facing left. */
  dir: number;
  flip: boolean;
  shadow: Phaser.GameObjects.Image;
  /** Current height above the ground while jumping. */
  lift: number;
}

interface PlayerView extends View {
  sprite: Phaser.GameObjects.Image;
  label: HTMLElement;
  color: number;
  /** Which way the character faces; kept while standing still. */
  view: number;
  flip: boolean;
}

export class GameScene extends Phaser.Scene {
  private world = new World();
  private pending: [number, number, number][] = [];
  private seq = 0;
  private acc = 0;
  private karts: KartView[] = [];
  private players = new Map<number, PlayerView>();
  private gate!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Rectangle;
  /** Ramps and cones; both are rebuilt when the layout changes. */
  private rampImages: Phaser.GameObjects.Image[] = [];
  private shownRampSeed = -1;
  private gateOpen = false;
  private camX = SPAWN.x + 120;
  private camY = START_Y;
  private camReady = false;
  private userZoom = Phaser.Math.Clamp(Number(localStorage.getItem(ZOOM_KEY)) || 1, ZOOM_MIN, ZOOM_MAX);

  private lastPhase: Phase | null = null;
  private lastCount = 0;
  private goUntil = 0;
  private boardAt = 0;
  private bumpAt = 0;

  constructor(private net: Net) {
    super("game");
  }

  create(): void {
    for (const [key, canvas] of Object.entries(buildTextures())) this.textures.addCanvas(key, canvas);

    this.add.tileSprite(-1200, -1200, WORLD_W + 2400, WORLD_H + 2400, "grass").setOrigin(0).setDepth(-2);
    this.add.image(0, 0, "track").setOrigin(0).setDepth(-1);
    this.gate = this.add.image(GATE_X, START_Y - HALF_W, "gate").setOrigin(0.5, 0).setDepth(6);

    this.target = this.add.rectangle(0, 0, 28, 20).setStrokeStyle(1.5, 0xffffff).setDepth(7).setVisible(false);
    this.tweens.add({ targets: this.target, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });

    this.world.karts.forEach((k, i) => {
      this.karts.push({
        img: this.add.image(k.x, k.y, `kart${i % LANES}_1`).setDepth(3),
        front: this.add.image(k.x, k.y, `kartf${i % LANES}_1`).setDepth(3).setVisible(false),
        driver: this.add.image(k.x, k.y, "seat0_0_0").setOrigin(0.5, 1).setDepth(4).setVisible(false),
        dir: KART_SIDE,
        flip: false,
        shadow: this.add.image(k.x, k.y, "shadow").setDepth(2.5).setVisible(false),
        lift: 0,
        px: k.x, py: k.y, ox: 0, oy: 0, rx: k.x, ry: k.y,
      });
    });

    this.cameras.main.setZoom(this.targetZoom());
    ui.onZoom((factor) => {
      this.userZoom = Phaser.Math.Clamp(this.userZoom * factor, ZOOM_MIN, ZOOM_MAX);
      localStorage.setItem(ZOOM_KEY, this.userZoom.toFixed(3));
    });

    setActionHandler(() => this.net.room.send(C.mount));
    // A hidden tab stops sending inputs, so release the keys on the server too.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.net.room.send(C.input, [++this.seq, 0, 0]);
    });
  }

  /** Zoom that shows about 620 world units across the window, times the user's multiplier. */
  private targetZoom(): number {
    return Phaser.Math.Clamp(this.scale.width / 620, 1.6, 3.2) * this.userZoom;
  }

  /** Applies the server's ramp layout to the simulation and redraws the ramps and cones. */
  private syncRamps(): void {
    const seed = this.net.race.seed;
    if (seed === this.shownRampSeed || seed === 0) return;
    if (seed !== rampSeed) setRamps(seed);
    this.shownRampSeed = seed;
    for (const img of this.rampImages) img.destroy();
    this.rampImages = RAMPS.map((r) =>
      this.add
        .image(r.x, r.y, `ramp${r.lanes}`)
        .setOrigin(RAMP_ORIGIN_X, 0.5)
        .setRotation(Math.atan2(r.dy, r.dx))
        .setDepth(0.5),
    );
    for (const c of CONES) this.rampImages.push(this.add.image(c.x, c.y - 3, "cone").setDepth(2));
  }

  update(_time: number, delta: number): void {
    this.syncRamps();
    if (this.net.snap) {
      this.applySnapshot(this.net.snap);
      this.net.snap = null;
    }
    this.acc = Math.min(this.acc + delta, 250);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.localTick();
    }
    this.draw(delta);
    this.updateHud();
  }

  /** One predicted simulation step: send the input, then apply it locally right away. */
  private localTick(): void {
    const w = this.world;
    w.karts.forEach((k, i) => { this.karts[i].px = k.x; this.karts[i].py = k.y; });
    for (const [id, v] of this.players) {
      const p = w.players.get(id)!;
      v.px = p.x; v.py = p.y;
    }
    const me = w.players.get(this.net.pid);
    const before = me && me.kart >= 0 ? { ...w.karts[me.kart] } : null;
    const knockBefore = me ? Math.hypot(me.vx, me.vy) : 0;
    if (me) {
      const [ix, iy] = readDirection();
      this.seq++;
      this.pending.push([this.seq, ix, iy]);
      if (this.pending.length > 90) this.pending.shift();
      this.net.room.send(C.input, [this.seq, ix, iy]);
      me.ix = ix; me.iy = iy;
    }
    w.step();

    // Being thrown by a kart while on foot.
    if (me && me.kart < 0 && Math.hypot(me.vx, me.vy) > knockBefore + 40 && performance.now() > this.bumpAt) {
      audio.bump();
      this.bumpAt = performance.now() + 180;
    }
    // A velocity change larger than the engine can produce means we hit something.
    if (before && me && me.kart >= 0) {
      const k = w.karts[me.kart];
      const dv = Math.hypot(k.vx - before.vx, k.vy - before.vy);
      const now = performance.now();
      if (k.air > 0 && before.air === 0) audio.jump();
      else if (k.air === 0 && dv > KART_ACCEL * DT * 4 && now > this.bumpAt) {
        audio.bump();
        this.bumpAt = now + 180;
      }
    }
  }

  /** Server reconciliation: adopt the server state, then replay inputs it has not processed yet. */
  private applySnapshot(s: SnapshotMsg): void {
    const w = this.world;
    const oldK = w.karts.map((k) => [k.x, k.y]);
    const oldP = new Map<number, [number, number]>();
    for (const p of w.players.values()) oldP.set(p.id, [p.x, p.y]);

    w.gateOpen = s.g === 1;
    for (let i = 0; i < w.karts.length; i++) {
      const o = i * K_STRIDE, k = w.karts[i];
      k.x = s.k[o]; k.y = s.k[o + 1]; k.vx = s.k[o + 2]; k.vy = s.k[o + 3]; k.air = s.k[o + 4];
    }
    const seen = new Set<number>();
    let ack = 0;
    for (let o = 0; o < s.p.length; o += P_STRIDE) {
      const id = s.p[o];
      seen.add(id);
      let p = w.players.get(id);
      if (!p) {
        p = { id, x: 0, y: 0, vx: 0, vy: 0, ix: 0, iy: 0, kart: -1 };
        w.players.set(id, p);
      }
      p.x = s.p[o + 1]; p.y = s.p[o + 2]; p.vx = s.p[o + 3]; p.vy = s.p[o + 4];
      p.ix = s.p[o + 5]; p.iy = s.p[o + 6]; p.kart = s.p[o + 7];
      if (id === this.net.pid) ack = s.p[o + 8];
    }
    for (const id of [...w.players.keys()]) {
      if (seen.has(id)) continue;
      w.players.delete(id);
      const v = this.players.get(id);
      if (v) { v.sprite.destroy(); v.label.remove(); this.players.delete(id); }
    }

    const me = w.players.get(this.net.pid);
    this.pending = this.pending.filter((inp) => inp[0] > ack);
    if (me) {
      for (const inp of this.pending) {
        me.ix = inp[1]; me.iy = inp[2];
        w.step();
      }
    }

    w.karts.forEach((k, i) => this.absorb(this.karts[i], oldK[i][0], oldK[i][1], k.x, k.y));
    for (const p of w.players.values()) {
      let v = this.players.get(p.id);
      if (!v) {
        const color = p.id % SHIRT_COLORS.length;
        v = {
          sprite: this.add.image(p.x, p.y, `char0_${color}_0_0`).setOrigin(0.5, 0.88),
          label: ui.createLabel(this.net.roster.get(p.id) ?? "…", p.id === this.net.pid),
          color,
          view: VIEW_FRONT,
          flip: false,
          px: p.x, py: p.y, ox: 0, oy: 0, rx: p.x, ry: p.y,
        };
        this.players.set(p.id, v);
      } else {
        const old = oldP.get(p.id)!;
        this.absorb(v, old[0], old[1], p.x, p.y);
      }
    }
  }

  /** Keeps the drawn position continuous when the simulated position is corrected. */
  private absorb(v: View, oldX: number, oldY: number, newX: number, newY: number): void {
    const dx = oldX - newX, dy = oldY - newY;
    v.ox += dx; v.oy += dy;
    v.px -= dx; v.py -= dy;
    if (Math.hypot(v.ox, v.oy) > SNAP_DIST) {
      v.ox = 0; v.oy = 0;
      v.px = newX; v.py = newY;
    }
  }

  private place(v: View, x: number, y: number, alpha: number, decay: number): void {
    v.ox *= decay; v.oy *= decay;
    v.rx = v.px + (x - v.px) * alpha + v.ox;
    v.ry = v.py + (y - v.py) * alpha + v.oy;
  }

  private draw(delta: number): void {
    const w = this.world;
    const alpha = this.acc / STEP_MS;
    const decay = Math.exp(-delta / SMOOTH_MS);
    const cam = this.cameras.main;

    const drivers = new Map<number, number>();
    for (const p of w.players.values()) if (p.kart >= 0) drivers.set(p.kart, p.id);

    w.karts.forEach((k, i) => {
      const v = this.karts[i];
      this.place(v, k.x, k.y, alpha, decay);
      const pid = drivers.get(i);
      const pv = pid === undefined ? undefined : this.players.get(pid);

      // A driven kart faces the way it is moving: sideways, towards the camera or away from it.
      if (pv && Math.hypot(k.vx, k.vy) > 14) {
        if (Math.abs(k.vx) >= Math.abs(k.vy)) { v.dir = KART_SIDE; v.flip = k.vx < 0; }
        else { v.dir = k.vy > 0 ? KART_FRONT : KART_BACK; v.flip = false; }
      }
      // In the air the kart rises along an arc, grows a little and leaves a shadow on the ground.
      const airT = k.air > 0 ? Phaser.Math.Clamp(1 - (k.air - alpha) / JUMP_TICKS, 0, 1) : 0;
      const arc = Math.sin(Math.PI * airT);
      v.lift = arc * JUMP_HEIGHT;
      const scale = 1 + arc * 0.18;
      const y = v.ry - v.lift;
      v.shadow.setVisible(k.air > 0).setPosition(v.rx, v.ry + 5).setAlpha(1 - arc * 0.5);

      // Layers per kart: kart, driver, then the kart's lower part again so the driver sits inside it.
      const depth = 3 + v.ry * 0.0001 + (k.air > 0 ? 1 : 0);
      const color = i % LANES;
      v.img.setPosition(v.rx, y).setTexture(`kart${color}_${v.dir}`).setFlipX(v.flip).setScale(scale).setDepth(depth);
      v.front.setVisible(pv !== undefined);
      v.driver.setVisible(pv !== undefined);
      if (pid !== undefined && pv) {
        const seat = KART_SEAT[v.dir];
        v.driver
          .setPosition(v.rx + (v.flip ? -seat.dx : seat.dx) * scale, y + seat.dy * scale)
          .setTexture(`seat${this.net.genders.get(pid) ?? 0}_${pv.color}_${v.dir}`)
          .setFlipX(v.flip)
          .setScale(scale)
          .setDepth(depth + 0.00003);
        v.front
          .setPosition(v.rx, y)
          .setTexture(`kartf${color}_${v.dir}`)
          .setFlipX(v.flip)
          .setScale(scale)
          .setDepth(depth + 0.00006);
        // Getting off leaves the character facing the same way.
        pv.view = v.dir;
        pv.flip = v.flip;
      }
    });

    const me = w.players.get(this.net.pid);
    let meX = this.camX, meY = this.camY, meLabelY = this.camY;
    const walkFrame = WALK_FRAMES[Math.floor(performance.now() / WALK_FRAME_MS) % WALK_FRAMES.length];
    for (const p of w.players.values()) {
      const v = this.players.get(p.id);
      if (!v) continue;
      this.place(v, p.x, p.y, alpha, decay);
      let lx = v.rx, ly = v.ry - 24;
      if (p.kart >= 0) {
        v.sprite.setVisible(false);
        lx = this.karts[p.kart].rx;
        ly = this.karts[p.kart].ry - 19 - this.karts[p.kart].lift * 1.1;
      } else {
        const moving = p.ix !== 0 || p.iy !== 0;
        // Left/right shows the side view, up/down the front view.
        if (p.ix !== 0) { v.view = VIEW_SIDE; v.flip = p.ix < 0; }
        else if (p.iy !== 0) { v.view = p.iy > 0 ? VIEW_FRONT : VIEW_BACK; v.flip = false; }
        const gender = this.net.genders.get(p.id) ?? 0;
        v.sprite
          .setVisible(true)
          .setPosition(v.rx, v.ry)
          .setTexture(`char${gender}_${v.color}_${v.view}_${moving ? walkFrame : 0}`)
          .setFlipX(v.flip)
          .setDepth(5 + v.ry / 100000);
      }
      if (p === me) { meX = lx; meY = p.kart >= 0 ? this.karts[p.kart].ry : v.ry - 8; meLabelY = ly; }
      const name = this.net.roster.get(p.id);
      if (name && v.label.textContent !== name) v.label.textContent = name;
      v.label.dataset.wx = String(lx);
      v.label.dataset.wy = String(ly);
    }

    // Camera follows the local player.
    if (!this.camReady && me) { this.camX = meX; this.camY = meY; this.camReady = true; }
    const follow = 1 - Math.exp(-delta / 110);
    this.camX += (meX - this.camX) * follow;
    this.camY += (meY - this.camY) * follow;
    cam.setZoom(cam.zoom + (this.targetZoom() - cam.zoom) * (1 - Math.exp(-delta / 80)));
    cam.centerOn(this.camX, this.camY);

    const toScreenX = (x: number) => (x - this.camX) * cam.zoom + cam.width / 2;
    const toScreenY = (y: number) => (y - this.camY) * cam.zoom + cam.height / 2;
    for (const v of this.players.values()) {
      ui.placeAbove(v.label, toScreenX(Number(v.label.dataset.wx)), toScreenY(Number(v.label.dataset.wy)));
    }

    // While walking, outline the nearest free kart and show "Press X" above the player's own label.
    const near = me && me.kart < 0 ? w.nearestFreeKart(me.x, me.y) : -1;
    this.target.setVisible(near >= 0);
    if (near >= 0) {
      this.target.setPosition(this.karts[near].rx, this.karts[near].ry);
      ui.setTooltip(toScreenX(meX), toScreenY(meLabelY) - 24, true);
    } else {
      ui.setTooltip(0, 0, false);
    }

    if (w.gateOpen !== this.gateOpen) {
      this.gateOpen = w.gateOpen;
      this.tweens.add({
        targets: this.gate,
        scaleY: this.gateOpen ? 0.04 : 1,
        alpha: this.gateOpen ? 0.5 : 1,
        duration: 350,
        ease: "Cubic.easeOut",
      });
    }
  }

  private updateHud(): void {
    const r = this.net.race;
    const w = this.world;
    const now = performance.now();
    const me = w.players.get(this.net.pid);

    if (r.ph !== this.lastPhase) {
      if (r.ph === "countdown") { audio.play(null); this.lastCount = 0; }
      else if (r.ph === "racing") {
        audio.play("race");
        if (this.lastPhase === "countdown") { audio.beep(81, 0.5); this.goUntil = now + 900; }
      } else {
        audio.play("lobby");
        if (r.ph === "finished" && this.lastPhase === "racing") audio.fanfare();
      }
      this.lastPhase = r.ph;
      this.boardAt = 0;
    }

    if (r.ph === "countdown") {
      const n = Phaser.Math.Clamp(Math.ceil((r.cdEnd - now) / 1000), 1, 3);
      if (n !== this.lastCount) { this.lastCount = n; audio.beep(69, 0.15); }
      ui.setCountdown(String(n));
    } else {
      ui.setCountdown(r.ph === "racing" && now < this.goUntil ? "GO!" : null);
    }

    ui.setTimer(r.ph === "racing" ? now - r.t0 : r.ph === "finished" ? r.ms : 0);
    const online = w.players.size;
    ui.setPhase(
      r.ph === "waiting" ? `${online} online · waiting for start`
      : r.ph === "countdown" ? "Get ready!"
      : r.ph === "racing" ? "Race in progress"
      : "Race finished",
    );
    ui.setHint(
      !me ? ""
      : me.kart >= 0 ? "Arrow keys: drive · X: get off"
      : "Arrow keys: walk · X next to a kart: drive",
    );

    if (now < this.boardAt) return;
    this.boardAt = now + 150;

    if (this.net.isAdmin) {
      const anyDriver = [...w.players.values()].some((p) => p.kart >= 0);
      ui.setAdminButtons(r.ph === "waiting" && anyDriver, r.ph === "countdown" || r.ph === "racing");
    }

    const rows: ui.BoardRow[] = r.res.map(([pid, name, ms], i) => ({
      pos: `${i + 1}.`, name, value: ui.formatTime(ms), me: pid === this.net.pid,
    }));
    if (r.ph === "racing" || r.ph === "finished") {
      const done = new Set(r.res.map((x) => x[0]));
      const running = r.racers
        .filter((pid) => !done.has(pid) && w.players.has(pid))
        .map((pid) => {
          const p = w.players.get(pid)!;
          return { pid, s: project(p.x, p.y).s };
        })
        .sort((a, b) => b.s - a.s);
      running.forEach((x, i) => {
        const pct = Phaser.Math.Clamp(Math.floor(((x.s - GATE_S) / (FINISH_S - GATE_S)) * 100), 0, 99);
        rows.push({
          pos: `${r.res.length + i + 1}.`,
          name: this.net.roster.get(x.pid) ?? "?",
          value: r.ph === "finished" ? "DNF" : `${pct}%`,
          me: x.pid === this.net.pid,
        });
      });
      ui.setBoard(null, rows);
    } else {
      ui.setBoard(rows.length ? "Last race" : null, rows);
    }
  }
}
