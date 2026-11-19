import { Client, type Room } from "colyseus.js";
import {
  ROOM_NAME, S, SERVER_PORT,
  type InitMsg, type Phase, type RaceMsg, type RosterMsg, type SnapshotMsg,
} from "@race/shared";

export interface RaceState {
  ph: Phase;
  ms: number;
  racers: number[];
  seed: number;
  res: [number, string, number][];
  /** Local clock (performance.now) at which the race started. */
  t0: number;
  /** Local clock at which the countdown ends. */
  cdEnd: number;
}

export interface Net {
  room: Room;
  pid: number;
  isAdmin: boolean;
  /** Latest unprocessed snapshot; the scene clears it after applying. */
  snap: SnapshotMsg | null;
  /** Player names by id. */
  roster: Map<number, string>;
  /** Player genders by id (0 male, 1 female). */
  genders: Map<number, number>;
  race: RaceState;
}

export async function connect(name: string, gender: number, isAdmin: boolean, onClosed: () => void): Promise<Net> {
  const url = import.meta.env.DEV
    ? `ws://${location.hostname}:${SERVER_PORT}`
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  const room = await new Client(url).joinOrCreate(ROOM_NAME, { name, gender, admin: isAdmin });
  const net: Net = {
    room,
    pid: -1,
    isAdmin,
    snap: null,
    roster: new Map(),
    genders: new Map(),
    race: { ph: "waiting", ms: 0, racers: [], seed: 0, res: [], t0: 0, cdEnd: 0 },
  };
  room.onMessage(S.init, (m: InitMsg) => (net.pid = m.pid));
  room.onMessage(S.snapshot, (m: SnapshotMsg) => (net.snap = m));
  room.onMessage(S.roster, (m: RosterMsg) => {
    net.roster = new Map(m.map((r) => [r[0], r[1]]));
    net.genders = new Map(m.map((r) => [r[0], r[2]]));
  });
  room.onMessage(S.race, (m: RaceMsg) => {
    const now = performance.now();
    net.race = { ...m, t0: now - m.ms, cdEnd: now + m.ms };
  });
  room.onLeave(onClosed);
  return net;
}
