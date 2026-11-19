// Messages exchanged between client and server.

export const ROOM_NAME = "race";
export const SERVER_PORT = 2567;
export const MAX_PLAYERS = 30;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

export type Phase = "waiting" | "countdown" | "racing" | "finished";

/** Client to server. */
export const C = {
  /** [seq, ix, iy] */
  input: "i",
  /** Toggle getting on or off a kart. */
  mount: "x",
  start: "start",
  end: "end",
} as const;

/** Server to client. */
export const S = {
  init: "init",
  snapshot: "s",
  roster: "r",
  race: "race",
} as const;

export interface InitMsg {
  pid: number;
  /** Whether the server accepted this player as admin (see ADMIN_KEY on the server). */
  admin: boolean;
}

/** Error message when the single room is full. */
export const ROOM_FULL = "room_full";

/**
 * World snapshot, flat arrays to keep it small.
 * p: [id, x, y, vx, vy, ix, iy, kart, lastInputSeq] per player
 * k: [x, y, vx, vy, air] per kart
 */
export interface SnapshotMsg {
  g: number;
  p: number[];
  k: number[];
}
export const P_STRIDE = 9;
export const K_STRIDE = 5;

/** [pid, name, gender] per player. Gender: 0 male, 1 female. */
export type RosterMsg = [number, string, number][];

export interface RaceMsg {
  ph: Phase;
  /** Countdown: ms left. Racing: ms elapsed. Finished: total race duration. */
  ms: number;
  racers: number[];
  /** Seed of the current ramp layout; see setRamps(). */
  seed: number;
  /** [pid, name, timeMs] in finishing order. */
  res: [number, string, number][];
}

export function validName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  return name;
}
