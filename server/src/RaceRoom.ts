import { createHash, timingSafeEqual } from "node:crypto";
import { Room, type Client } from "colyseus";
import {
  C, S, FINISH_S, GATE_X, KART_R, MAX_PLAYERS, SPAWN, STEP_MS, TICK_RATE, WALK_R, World,
  ROOM_FULL, project, setRamps, validName,
  type InitMsg, type Phase, type Player, type RaceMsg, type RosterMsg, type SnapshotMsg,
} from "@pixelyard/shared";

const COUNTDOWN_TICKS = 3 * TICK_RATE;
const FINISHED_TICKS = 8 * TICK_RATE;
const RACE_TIMEOUT_TICKS = 5 * 60 * TICK_RATE;
const SNAPSHOT_EVERY = 2;
const MAX_QUEUED_INPUTS = 4;

interface Info {
  pid: number;
  name: string;
  gender: number;
  admin: boolean;
  /** Pending inputs: [seq, ix, iy]. */
  queue: [number, number, number][];
  seq: number;
}

// Admin: a player is admin when the adminKey they send matches ADMIN_KEY.
// Local development without ADMIN_KEY uses DEV_ADMIN_KEY; production without ADMIN_KEY has no admin.
export const DEV_ADMIN_KEY = "dev";
const ADMIN_KEY = process.env.ADMIN_KEY || (process.env.NODE_ENV === "production" ? "" : DEV_ADMIN_KEY);
const digest = (s: string) => createHash("sha256").update(s).digest();
function isAdmin(options: { adminKey?: unknown }): boolean {
  return ADMIN_KEY !== "" && typeof options?.adminKey === "string"
    && timingSafeEqual(digest(options.adminKey), digest(ADMIN_KEY));
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const dir = (v: unknown) => (v === 1 || v === -1 ? v : 0);

export class RaceRoom extends Room {
  maxClients = MAX_PLAYERS;
  /** Pixelyard runs a single room: once it is full, newcomers are turned away instead of getting a room of their own. */
  private static openRooms = 0;
  private counted = false;

  private world = new World();
  private infos = new Map<string, Info>();
  private nextPid = 1;
  private tick = 0;
  private acc = 0;

  private phase: Phase = "waiting";
  private phaseEndTick = 0;
  private startTick = 0;
  private durationMs = 0;
  private racers: number[] = [];
  private results: [number, string, number][] = [];
  /** Seed of the ramp layout; a new one is drawn after every race. The layout is shared by all rooms in this process. */
  private rampSeed = 0;

  private shuffleRamps(): void {
    this.rampSeed = 1 + Math.floor(Math.random() * 0x7fffffff);
    setRamps(this.rampSeed);
  }

  onCreate(): void {
    if (RaceRoom.openRooms >= 1) throw new Error(ROOM_FULL);
    RaceRoom.openRooms++;
    this.counted = true;
    this.shuffleRamps();
    this.onMessage(C.input, (client, msg) => {
      const info = this.infos.get(client.sessionId);
      if (!info || !Array.isArray(msg) || !Number.isFinite(msg[0])) return;
      // A client sends one input per tick; ignore floods instead of letting the queue grow.
      if (info.queue.length >= MAX_QUEUED_INPUTS * 4) return;
      info.queue.push([msg[0], dir(msg[1]), dir(msg[2])]);
    });
    this.onMessage(C.mount, (client) => this.toggleMount(client));
    this.onMessage(C.start, (client) => {
      if (this.infos.get(client.sessionId)?.admin) this.startCountdown();
    });
    this.onMessage(C.end, (client) => {
      if (!this.infos.get(client.sessionId)?.admin) return;
      if (this.phase === "countdown") this.resetRace();
      else if (this.phase === "racing") this.finishRace();
    });
    this.setSimulationInterval((dt) => this.loop(dt), STEP_MS);
  }

  onDispose(): void {
    if (this.counted) RaceRoom.openRooms--;
  }

  onJoin(client: Client, options: { name?: unknown; gender?: unknown; adminKey?: unknown }): void {
    const name = validName(options?.name);
    if (!name) throw new Error("Invalid name");
    const pid = this.nextPid++;
    const gender = options?.gender === 1 ? 1 : 0;
    const admin = isAdmin(options);
    this.infos.set(client.sessionId, { pid, name, gender, admin, queue: [], seq: 0 });
    const player: Player = { id: pid, x: 0, y: 0, vx: 0, vy: 0, ix: 0, iy: 0, kart: -1 };
    this.placeAtSpawn(player);
    this.world.players.set(pid, player);
    client.send(S.init, { pid, admin } satisfies InitMsg);
    client.send(S.race, this.raceMsg());
    this.broadcast(S.roster, this.rosterMsg());
  }

  onLeave(client: Client): void {
    const info = this.infos.get(client.sessionId);
    if (!info) return;
    this.infos.delete(client.sessionId);
    this.world.players.delete(info.pid);
    if (this.racers.includes(info.pid)) {
      this.racers = this.racers.filter((id) => id !== info.pid);
      this.broadcast(S.race, this.raceMsg());
    }
    this.broadcast(S.roster, this.rosterMsg());
  }

  private placeAtSpawn(p: Player): void {
    p.vx = 0; p.vy = 0;
    p.x = SPAWN.x + Math.random() * SPAWN.w;
    p.y = SPAWN.y + (Math.random() - 0.5) * SPAWN.h;
  }

  private toggleMount(client: Client): void {
    const info = this.infos.get(client.sessionId);
    const p = info && this.world.players.get(info.pid);
    if (!p) return;
    if (p.kart >= 0) {
      if (this.world.karts[p.kart].air > 0) return; // no getting off mid-jump
      p.kart = -1;
      p.y += KART_R + WALK_R + 2;
    } else {
      const k = this.world.nearestFreeKart(p.x, p.y);
      if (k < 0) return;
      p.kart = k;
      p.x = this.world.karts[k].x;
      p.y = this.world.karts[k].y;
    }
  }

  private loop(dtMs: number): void {
    this.acc = Math.min(this.acc + dtMs, STEP_MS * 5);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.step();
    }
  }

  private step(): void {
    this.tick++;
    for (const info of this.infos.values()) {
      const p = this.world.players.get(info.pid);
      if (!p) continue;
      // Drop the oldest inputs if the client got ahead of the server.
      while (info.queue.length > MAX_QUEUED_INPUTS) info.seq = info.queue.shift()![0];
      const next = info.queue.shift();
      if (next) { info.seq = next[0]; p.ix = next[1]; p.iy = next[2]; }
    }
    this.world.step();
    this.updateRace();
    if (this.tick % SNAPSHOT_EVERY === 0) this.broadcast(S.snapshot, this.snapshotMsg());
  }

  private startCountdown(): void {
    if (this.phase !== "waiting") return;
    if (![...this.world.players.values()].some((p) => p.kart >= 0)) return;
    this.phase = "countdown";
    this.phaseEndTick = this.tick + COUNTDOWN_TICKS;
    this.racers = [];
    this.results = [];
    this.broadcast(S.race, this.raceMsg());
  }

  private updateRace(): void {
    if (this.phase === "countdown" && this.tick >= this.phaseEndTick) {
      this.racers = [...this.world.players.values()].filter((p) => p.kart >= 0).map((p) => p.id);
      if (this.racers.length === 0) { this.resetRace(); return; }
      this.phase = "racing";
      this.startTick = this.tick;
      this.world.gateOpen = true;
      this.broadcast(S.race, this.raceMsg());
    } else if (this.phase === "racing") {
      let changed = false;
      for (const pid of this.racers) {
        if (this.results.some((r) => r[0] === pid)) continue;
        const p = this.world.players.get(pid);
        if (!p || p.kart < 0) continue;
        if (project(p.x, p.y).s >= FINISH_S) {
          this.results.push([pid, this.nameOf(pid), Math.round((this.tick - this.startTick) * STEP_MS)]);
          changed = true;
        }
      }
      const allDone = this.racers.every((pid) => this.results.some((r) => r[0] === pid));
      if (allDone || this.tick - this.startTick >= RACE_TIMEOUT_TICKS) this.finishRace();
      else if (changed) this.broadcast(S.race, this.raceMsg());
    } else if (this.phase === "finished" && this.tick >= this.phaseEndTick) {
      this.resetRace();
    }
  }

  private finishRace(): void {
    this.phase = "finished";
    this.durationMs = Math.round((this.tick - this.startTick) * STEP_MS);
    this.phaseEndTick = this.tick + FINISHED_TICKS;
    this.broadcast(S.race, this.raceMsg());
  }

  /** Closes the gate and returns every kart (with its driver) to the grid. */
  private resetRace(): void {
    this.phase = "waiting";
    this.racers = [];
    this.world.gateOpen = false;
    this.shuffleRamps();
    for (let k = 0; k < this.world.karts.length; k++) this.world.resetKart(k);
    for (const p of this.world.players.values()) {
      if (p.kart >= 0) { p.x = this.world.karts[p.kart].x; p.y = this.world.karts[p.kart].y; }
      else if (p.x >= GATE_X - WALK_R) this.placeAtSpawn(p);
    }
    this.broadcast(S.race, this.raceMsg());
  }

  private nameOf(pid: number): string {
    for (const info of this.infos.values()) if (info.pid === pid) return info.name;
    return "?";
  }

  private rosterMsg(): RosterMsg {
    return [...this.infos.values()].map((i) => [i.pid, i.name, i.gender]);
  }

  private raceMsg(): RaceMsg {
    let ms = 0;
    if (this.phase === "countdown") ms = (this.phaseEndTick - this.tick) * STEP_MS;
    else if (this.phase === "racing") ms = (this.tick - this.startTick) * STEP_MS;
    else if (this.phase === "finished") ms = this.durationMs;
    return { ph: this.phase, ms: Math.round(ms), racers: this.racers, seed: this.rampSeed, res: this.results };
  }

  private snapshotMsg(): SnapshotMsg {
    const p: number[] = [];
    for (const info of this.infos.values()) {
      const pl = this.world.players.get(info.pid);
      if (pl) p.push(pl.id, r2(pl.x), r2(pl.y), r2(pl.vx), r2(pl.vy), pl.ix, pl.iy, pl.kart, info.seq);
    }
    const k: number[] = [];
    for (const kart of this.world.karts) k.push(r2(kart.x), r2(kart.y), r2(kart.vx), r2(kart.vy), kart.air);
    return { g: this.world.gateOpen ? 1 : 0, p, k };
  }
}
