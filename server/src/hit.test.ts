// Quick check of kart-versus-walker physics: npx tsx server/src/hit.test.ts
import { World } from "@pixelyard/shared";

const w = new World();
w.gateOpen = true;
const kart = w.karts[0];
kart.x = 1500; kart.y = 240; kart.vx = 200; kart.vy = 0;
w.players.set(1, { id: 1, x: 1540, y: 243, vx: 0, vy: 0, ix: 0, iy: 0, kart: -1 });
const p = w.players.get(1)!;
let maxKnock = 0;
for (let i = 0; i < 60; i++) { w.step(); maxKnock = Math.max(maxKnock, Math.hypot(p.vx, p.vy)); }
console.log("moving kart: walker thrown at", maxKnock.toFixed(0), "u/s, ends at x", p.x.toFixed(0), "resting", p.vx === 0 && p.vy === 0);

const parked = w.karts[1];
parked.x = 2000; parked.y = 240; parked.vx = 0; parked.vy = 0;
p.x = 1970; p.y = 240; p.ix = 1;
for (let i = 0; i < 40; i++) w.step();
console.log("parked kart: walker walked through to x", p.x.toFixed(0), "(start 1970, kart at 2000)");
if (maxKnock < 150 || p.x < 2040) { console.error("FAIL"); process.exit(1); }
console.log("OK");

// Jump ramp: a kart driving onto the first ramp takes off, flies faster than top speed, then lands.
{
  const { RAMPS, JUMP_SPEED, KART_MAX } = await import("@pixelyard/shared");
  const w2 = new World();
  w2.gateOpen = true;
  const r = RAMPS[0];
  const k = w2.karts[0];
  k.x = r.x - r.dx * 30; k.y = r.y - r.dy * 30; k.vx = r.dx * KART_MAX; k.vy = r.dy * KART_MAX;
  w2.players.set(1, { id: 1, x: k.x, y: k.y, vx: 0, vy: 0, ix: r.dx, iy: r.dy, kart: 0 });
  let airTicks = 0, topSpeed = 0;
  const x0 = k.x, y0 = k.y;
  for (let i = 0; i < 45; i++) { w2.step(); if (k.air > 0) airTicks++; topSpeed = Math.max(topSpeed, Math.hypot(k.vx, k.vy)); }
  const withRamp = Math.hypot(k.x - x0, k.y - y0);
  console.log(`ramp: ${airTicks} ticks in the air, top speed ${topSpeed}, ${withRamp.toFixed(0)} units in 1.5s (no ramp: ${(KART_MAX * 1.5).toFixed(0)})`);
  if (airTicks === 0 || topSpeed !== JUMP_SPEED || k.air !== 0 || withRamp <= KART_MAX * 1.5) { console.error("FAIL ramp"); process.exit(1); }
  console.log("OK ramp");
}

// Trap ramp: jumping it lands in a wall of cones, so the kart ends up behind a kart that just drove.
{
  // RAMPS and CONES are replaced by setRamps(), so read them from the module each time.
  const shared = await import("@pixelyard/shared");
  const { KART_MAX, setRamps } = shared;
  type R = (typeof shared.RAMPS)[0];
  for (const seed of [1, 2, 3]) {
    setRamps(seed);
    const along = (r: R, c: { x: number; y: number }) => (c.x - r.x) * r.dx + (c.y - r.y) * r.dy;
    const across = (r: R, c: { x: number; y: number }) => -(c.x - r.x) * r.dy + (c.y - r.y) * r.dx;
    const traps = shared.RAMPS.filter((r) => shared.CONES.some((c) => Math.abs(along(r, c) - 288) < 1 && Math.abs(across(r, c)) <= r.hw));
    if (traps.length !== 1 || traps[0].lanes !== 4) { console.error("FAIL: expected one 4-lane trap, seed", seed); process.exit(1); }
    const r = traps[0];
    const w3 = new World();
    w3.gateOpen = true;
    const k = w3.karts[0];
    k.x = r.x - r.dx * 30; k.y = r.y - r.dy * 30; k.vx = r.dx * KART_MAX; k.vy = r.dy * KART_MAX;
    w3.players.set(1, { id: 1, x: k.x, y: k.y, vx: 0, vy: 0, ix: r.dx, iy: r.dy, kart: 0 });
    const x0 = k.x, y0 = k.y;
    for (let i = 0; i < 75; i++) w3.step();
    const dist = (k.x - x0) * r.dx + (k.y - y0) * r.dy;
    console.log(`trap seed ${seed}: ${dist.toFixed(0)} units in 2.5s over the trap (plain driving: ${(KART_MAX * 2.5).toFixed(0)})`);
    if (dist >= KART_MAX * 2.5) { console.error("FAIL: trap did not slow the kart"); process.exit(1); }
  }
  console.log("OK trap");
}

// Walled-in ramp near the finish: driving straight at it never gets a kart into the air.
{
  const shared = await import("@pixelyard/shared");
  for (const seed of [1, 2, 3]) {
    shared.setRamps(seed);
    const r = shared.RAMPS[shared.blockedRamp];
    for (const side of [-0.8, 0, 0.8]) {
      const w4 = new World();
      w4.gateOpen = true;
      const k = w4.karts[0];
      k.x = r.x - r.dx * 120 - r.dy * side * r.hw; k.y = r.y - r.dy * 120 + r.dx * side * r.hw;
      k.vx = r.dx * shared.KART_MAX; k.vy = r.dy * shared.KART_MAX;
      w4.players.set(1, { id: 1, x: k.x, y: k.y, vx: 0, vy: 0, ix: r.dx, iy: r.dy, kart: 0 });
      let flew = false;
      for (let i = 0; i < 90; i++) { w4.step(); if (k.air > 0) flew = true; }
      if (flew) { console.error("FAIL: reached the walled-in ramp, seed", seed, "side", side); process.exit(1); }
    }
  }
  console.log("OK walled-in ramp");
}
