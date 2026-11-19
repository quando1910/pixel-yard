// Checks admin-key handling and the single-room limit against a running server.
// Usage: ADMIN_KEY=<key> npx tsx server/src/prod-check.ts [url]
import { Client } from "colyseus.js";
import { ROOM_FULL, ROOM_NAME, S, SERVER_PORT, MAX_PLAYERS, type InitMsg } from "@pixelyard/shared";

const url = process.argv[2] || `ws://localhost:${SERVER_PORT}`;
const key = process.env.ADMIN_KEY || "";
let failed = false;
const check = (ok: boolean, what: string) => { console.log(`${ok ? "OK  " : "FAIL"} ${what}`); if (!ok) failed = true; };

async function join(opts: Record<string, unknown>) {
  const room = await new Client(url).joinOrCreate(ROOM_NAME, { name: "Check", ...opts });
  const init = await new Promise<InitMsg>((resolve) => {
    room.onMessage(S.init, resolve);
    for (const t of [S.race, S.roster, S.snapshot]) room.onMessage(t, () => {});
  });
  return { room, init };
}

const rooms = [];
const right = await join({ adminKey: key }); rooms.push(right.room);
check(right.init.admin === true, "correct admin key is accepted");
const wrong = await join({ adminKey: key + "x" }); rooms.push(wrong.room);
check(wrong.init.admin === false, "wrong admin key is refused");
const legacy = await join({ admin: true }); rooms.push(legacy.room);
check(legacy.init.admin === false, "old isAdmin flag is ignored when ADMIN_KEY is set");

while (rooms.length < MAX_PLAYERS) rooms.push((await join({})).room);
try {
  await join({});
  check(false, `player ${MAX_PLAYERS + 1} is turned away`);
} catch (err) {
  check(String((err as Error).message).includes(ROOM_FULL), `player ${MAX_PLAYERS + 1} is turned away with "${ROOM_FULL}"`);
}
for (const r of rooms) await r.leave();
await new Promise((r) => setTimeout(r, 1500));
const again = await join({});
check(again.init.pid > 0, "a new room opens after everyone left");
await again.room.leave();
process.exit(failed ? 1 : 0);
