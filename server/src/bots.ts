// Smoke test and load test: bots join, take a kart, race to the finish.
// Usage: npx tsx server/src/bots.ts [count] [url]
// Bot 1 acts as admin; against a server with ADMIN_KEY set, pass the same ADMIN_KEY in the environment.
import { Client } from "colyseus.js";
import {
  C, S, P_STRIDE, K_STRIDE, ROOM_NAME, SERVER_PORT, STEP_MS, homeSlot, pointAt, project,
  type InitMsg, type RaceMsg, type SnapshotMsg,
} from "@pixelyard/shared";

const count = Number(process.argv[2]) || 3;
const url = process.argv[3] || `ws://localhost:${SERVER_PORT}`;
const sign = (d: number, dead: number) => (d > dead ? 1 : d < -dead ? -1 : 0);

let mounted = 0;
let racesSeen = 0;

async function bot(i: number): Promise<void> {
  const room = await new Client(url).joinOrCreate(ROOM_NAME, { name: `Bot ${i + 1}`, gender: i % 2, admin: i === 0, adminKey: i === 0 ? process.env.ADMIN_KEY : undefined });
  let pid = -1, seq = 0, phase = "waiting", asked = false, started = false;
  let me = { x: 0, y: 0, kart: -1 };
  let lastS = 0, sinceCheck = 0, reverse = 0, lane = 0;
  const slot = homeSlot(i);
  room.onMessage(S.init, (m: InitMsg) => (pid = m.pid));
  room.onMessage(S.roster, () => {});
  room.onMessage(S.race, (m: RaceMsg) => {
    if (i === 0 && m.ph !== phase) {
      console.log(`[race] ${m.ph}`, m.res.map((r) => `${r[1]} ${(r[2] / 1000).toFixed(2)}s`).join(", "));
      if (m.ph === "waiting" && phase === "finished" && ++racesSeen >= 1) process.exit(0);
    }
    phase = m.ph;
  });
  room.onMessage(S.snapshot, (m: SnapshotMsg) => {
    for (let o = 0; o < m.p.length; o += P_STRIDE) {
      if (m.p[o] !== pid) continue;
      const wasWalking = me.kart < 0;
      me = { x: m.p[o + 1], y: m.p[o + 2], kart: m.p[o + 7] };
      if (wasWalking && me.kart >= 0) { mounted++; console.log(`Bot ${i + 1} took kart ${me.kart}`); }
    }
    if (i === 0 && m.k.length !== 30 * K_STRIDE) console.log("unexpected kart count");
  });

  setInterval(() => {
    if (pid < 0) return;
    let ix = 0, iy = 0;
    if (me.kart < 0) {
      ix = sign(slot.x - me.x, 4);
      iy = sign(slot.y - me.y, 4);
      if (ix === 0 && iy === 0 && !asked) { asked = true; room.send(C.mount); setTimeout(() => (asked = false), 500); }
    } else if (phase === "racing") {
      // Aim ahead along the track, in this bot's current lane.
      const s = project(me.x, me.y).s;
      const t = pointAt(s + 70);
      ix = sign(t.x - t.dy * lane - me.x, 10);
      iy = sign(t.y + t.dx * lane - me.y, 10);
      // Stuck behind cones: no progress for a second, so back off briefly and try another lane.
      if (++sinceCheck >= 30) {
        if (s - lastS < 25) { lane = (Math.random() * 2 - 1) * 90; reverse = 12; }
        lastS = s;
        sinceCheck = 0;
      }
      if (reverse > 0) {
        reverse--;
        ix = sign(-t.dx, 0.5);
        iy = sign(-t.dy, 0.5);
      }
    } else if (phase === "waiting" && i === 0 && mounted >= count && !started) {
      started = true;
      console.log("all bots mounted, starting race");
      room.send(C.start);
    } else if (phase === "waiting") {
      ix = 1; // push against the closed gate
    }
    room.send(C.input, [++seq, ix, iy]);
    if (process.env.BOT_DEBUG && seq % 240 === 0) {
      console.log(`bot ${i + 1} ${phase} kart=${me.kart} x=${me.x.toFixed(0)} y=${me.y.toFixed(0)} s=${project(me.x, me.y).s.toFixed(0)}`);
    }
  }, STEP_MS);
}

for (let i = 0; i < count; i++) bot(i).catch((e) => { console.error(e); process.exit(1); });
setTimeout(() => { console.log("timeout"); process.exit(2); }, 150000);
