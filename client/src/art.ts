// All artwork is drawn in code onto small canvases (original pixel art, no external assets).
import {
  CENTER, FINISH_S, GATE_X, HALF_W, KART_COUNT, LANE_W, START_Y, TRACK_W, WORLD_H, WORLD_W,
  GATE_S, RAMP_LEN, homeSlot, pointAt, project, seededRandom,
} from "@race/shared";

export const KART_COLORS = [
  "#e5484d", "#f08a24", "#f2c230", "#8fce3a", "#2fae66",
  "#22b8b0", "#3aa0f0", "#4a63e0", "#9655e0", "#e85aa8",
];
export const SHIRT_COLORS = [
  "#e5484d", "#3aa0f0", "#f2c230", "#2fae66", "#9655e0", "#f08a24", "#22b8b0", "#e85aa8",
];

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number, draw: (c: Ctx) => void): HTMLCanvasElement {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  draw(el.getContext("2d")!);
  return el;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

function rect(c: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

// Chibi characters as pixel maps: [gender][view][frame][row].
// View 0 faces the camera, view 1 faces right (flip it for left), view 2 (generated below) faces away. Frame 0 stands; 1 and 2 are the two walk steps.
// Seen slightly from above: the top of the hair takes up most of the head.
// H/h hair, S/s skin, B blush, E eye, W eye shine, J/j jacket (player color), T shirt, P/p trousers or skirt, K shoes.
const CHARACTER_MAPS: string[][][][] = [[[[".....HHHHHH.....", "...HHHHHHHHHH...", "..HHHhhhHHHHHH..", ".HHHhhHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHSHHHHSHHHH.", ".HHSSSSSSSSSSHH.", ".HSSEWSSSSWESSH.", ".HSSEESSSSEESSH.", "..SBBSSssSSBBS..", "...SSSSSSSSSS...", "....JJTTTTJJ....", "...JJJTTTTJJJ...", "..JJ.JTTTTJ.JJ..", "..JJ.JTTTTJ.JJ..", "..SS.jTTTTj.SS..", ".....jjjjjj.....", ".....PPPPPP.....", ".....PP..PP.....", ".....PP..PP.....", "....KKK..KKK...."], [".....HHHHHH.....", "...HHHHHHHHHH...", "..HHHhhhHHHHHH..", ".HHHhhHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHSHHHHSHHHH.", ".HHSSSSSSSSSSHH.", ".HSSEWSSSSWESSH.", ".HSSEESSSSEESSH.", "..SBBSSssSSBBS..", "...SSSSSSSSSS...", "....JJTTTTJJ....", "...JJJTTTTJJJ...", "..JJ.JTTTTJ.JJ..", "..SS.JTTTTJ.JJ..", ".....jTTTTj.SS..", ".....jjjjjj.....", ".....PPPPPP.....", ".....PP..PP.....", "....KKK..PP.....", ".........KKK...."], [".....HHHHHH.....", "...HHHHHHHHHH...", "..HHHhhhHHHHHH..", ".HHHhhHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHSHHHHSHHHH.", ".HHSSSSSSSSSSHH.", ".HSSEWSSSSWESSH.", ".HSSEESSSSEESSH.", "..SBBSSssSSBBS..", "...SSSSSSSSSS...", "....JJTTTTJJ....", "...JJJTTTTJJJ...", "..JJ.JTTTTJ.JJ..", "..JJ.JTTTTJ.SS..", "..SS.jTTTTj.....", ".....jjjjjj.....", ".....PPPPPP.....", ".....PP..PP.....", ".....PP..KKK....", "....KKK........."]], [["....HHHHHHH.....", "..HHHHHHHHHH....", ".HHHhhhHHHHHH...", ".HHhhHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHSSHH..", ".HHHHHHSSSSSSS..", ".HHHHHSSSSEWSS..", "..HHHHSSSSEESS..", "..HHHSSSSSSBBS..", "....SSSSSSSS....", "......JJJJ......", ".....JJJJJJ.....", ".....JJjjJJ.....", ".....JJjjJJ.....", ".....JJSSJj.....", "......jjjj......", "......PPPP......", "......PPPP......", "......PPPP......", "......KKKKK....."], ["....HHHHHHH.....", "..HHHHHHHHHH....", ".HHHhhhHHHHHH...", ".HHhhHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHSSHH..", ".HHHHHHSSSSSSS..", ".HHHHHSSSSEWSS..", "..HHHHSSSSEESS..", "..HHHSSSSSSBBS..", "....SSSSSSSS....", "......JJJJ......", ".....JJJJJJ.....", ".....JJJjjJ.....", ".....JJJJjjJ....", ".....JJJJJSS....", "......jjjj......", "......PPPP......", ".....PPPPPP.....", "....PPP..PPP....", "...KKK...KKKK..."], ["....HHHHHHH.....", "..HHHHHHHHHH....", ".HHHhhhHHHHHH...", ".HHhhHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHSSHH..", ".HHHHHHSSSSSSS..", ".HHHHHSSSSEWSS..", "..HHHHSSSSEESS..", "..HHHSSSSSSBBS..", "....SSSSSSSS....", "......JJJJ......", ".....JJJJJJ.....", ".....JjjJJJ.....", "....JjjJJJJ.....", "....SSJJJJJ.....", "......jjjj......", "......PPPP......", ".....PPPPPP.....", "....PPP..PPP....", "...KKK...KKKK..."]]], [[[".HHH........HHH.", "HHHHH.HHHH.HHHHH", "HHhHHHHHHHHHHhHH", ".HHHHhhhHHHHHHH.", ".HHHhhHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHSHHHHSHHHH.", ".HHSSSSSSSSSSHH.", ".HSSEWSSSSWESSH.", ".HSSEESSSSEESSH.", ".HSBBSSssSSBBSH.", "..HSSSSSSSSSSH..", "....JJJTTJJJ....", "...JJJJJJJJJJ...", "..JJ.JJJJJJ.JJ..", "..JJ.JJJJJJ.JJ..", "..SS.jJJJJj.SS..", "....PPPPPPPP....", "....PPPPPPPP....", ".....pPPPPp.....", ".....SS..SS.....", "....KKK..KKK...."], [".HHH........HHH.", "HHHHH.HHHH.HHHHH", "HHhHHHHHHHHHHhHH", ".HHHHhhhHHHHHHH.", ".HHHhhHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHSHHHHSHHHH.", ".HHSSSSSSSSSSHH.", ".HSSEWSSSSWESSH.", ".HSSEESSSSEESSH.", ".HSBBSSssSSBBSH.", "..HSSSSSSSSSSH..", "....JJJTTJJJ....", "...JJJJJJJJJJ...", "..JJ.JJJJJJ.JJ..", "..SS.JJJJJJ.JJ..", ".....jJJJJj.SS..", "....PPPPPPPP....", "....PPPPPPPP....", ".....pPPPPp.....", "....KKK..SS.....", ".........KKK...."], [".HHH........HHH.", "HHHHH.HHHH.HHHHH", "HHhHHHHHHHHHHhHH", ".HHHHhhhHHHHHHH.", ".HHHhhHHHHHHHHH.", ".HHHHHHHHHHHHHH.", ".HHHHSHHHHSHHHH.", ".HHSSSSSSSSSSHH.", ".HSSEWSSSSWESSH.", ".HSSEESSSSEESSH.", ".HSBBSSssSSBBSH.", "..HSSSSSSSSSSH..", "....JJJTTJJJ....", "...JJJJJJJJJJ...", "..JJ.JJJJJJ.JJ..", "..JJ.JJJJJJ.SS..", "..SS.jJJJJj.....", "....PPPPPPPP....", "....PPPPPPPP....", ".....pPPPPp.....", ".....SS..KKK....", "....KKK........."]], [["..HHH..HHHH.....", ".HHHHHHHHHHHH...", ".HHhHHHhhHHHHH..", "..HHHHhHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHSSHH..", ".HHHHHHSSSSSSS..", ".HHHHHSSSSEWSS..", ".HHHHHSSSSEESS..", ".HHHHSSSSSSBBS..", "..HH.SSSSSSS....", "......JJJJ......", ".....JJJJJJ.....", ".....JJjjJJ.....", ".....JJjjJJ.....", ".....JJSSJj.....", ".....PPPPPP.....", ".....PPPPPP.....", "......pPPp......", ".......SS.......", ".......KKK......"], ["..HHH..HHHH.....", ".HHHHHHHHHHHH...", ".HHhHHHhhHHHHH..", "..HHHHhHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHSSHH..", ".HHHHHHSSSSSSS..", ".HHHHHSSSSEWSS..", ".HHHHHSSSSEESS..", ".HHHHSSSSSSBBS..", "..HH.SSSSSSS....", "......JJJJ......", ".....JJJJJJ.....", ".....JJJjjJ.....", ".....JJJJjjJ....", ".....JJJJJSS....", ".....PPPPPP.....", ".....PPPPPP.....", "......pPPp......", ".....SS..SS.....", "....KKK..KKK...."], ["..HHH..HHHH.....", ".HHHHHHHHHHHH...", ".HHhHHHhhHHHHH..", "..HHHHhHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHHHHH..", ".HHHHHHHHHSSHH..", ".HHHHHHSSSSSSS..", ".HHHHHSSSSEWSS..", ".HHHHHSSSSEESS..", ".HHHHSSSSSSBBS..", "..HH.SSSSSSS....", "......JJJJ......", ".....JJJJJJ.....", ".....JjjJJJ.....", "....JjjJJJJ.....", "....SSJJJJJ.....", ".....PPPPPP.....", ".....PPPPPP.....", "......pPPp......", ".....SS..SS.....", "....KKK..KKK...."]]]];
const CHARACTER_PALETTE: Record<string, string> = {
  H: "#2e2832", h: "#4d4354", S: "#f3c9a8", s: "#d9a084", B: "#ee9c90",
  E: "#2a2233", W: "#ffffff", T: "#f4f1ea", P: "#8a5638", p: "#6e4229", K: "#2a2630",
};
export const CHARACTER_W = 18;
export const CHARACTER_H = 26;
export const GENDERS = ["Male", "Female"];

export const VIEW_FRONT = 0;
export const VIEW_SIDE = 1;
export const VIEW_BACK = 2;
/** Rows of a character map taken up by the head. */
const HEAD_ROWS = 12;
// The back view is the front view with the face covered by hair and the shirt covered by the jacket.
for (const views of CHARACTER_MAPS) {
  views[VIEW_BACK] = views[VIEW_FRONT].map((frame) =>
    frame.map((row, y) => (y < HEAD_ROWS ? row.replace(/[SsBEW]/g, "H") : row.replace(/T/g, "J"))),
  );
}

/** Rows of a character map that show head, arms and torso (everything above the legs). */
const SEATED_ROWS = 18;
export const SEATED_H = SEATED_ROWS + 2;

/** Draws a pixel map with a 1px dark outline. The canvas needs 1px of padding on every side. */
function drawMap(c: Ctx, rows: string[], colorOf: (ch: string) => string): void {
  const width = rows[0].length;
  const filled = (x: number, y: number) => rows[y]?.[x] !== undefined && rows[y][x] !== ".";
  for (let y = -1; y <= rows.length; y++) {
    for (let x = -1; x <= width; x++) {
      if (filled(x, y)) rect(c, colorOf(rows[y][x]), x + 1, y + 1, 1, 1);
      else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        rect(c, "#1c1722", x + 1, y + 1, 1, 1);
      }
    }
  }
}

function drawCharacter(c: Ctx, rows: string[], shirt: string): void {
  drawMap(c, rows, (ch) => (ch === "J" ? shirt : ch === "j" ? shade(shirt, -0.3) : CHARACTER_PALETTE[ch]));
}

// Karts as pixel maps, seen from the same raised angle as the characters: [direction][row].
// C/c/L body color (base, dark, light), K/k tires, G metal, W white trim, S seat.
export const KART_FRONT = 0;
export const KART_SIDE = 1;
export const KART_BACK = 2;
const KART_MAPS: string[][] = [["....SSSSSSSSSS....", "...CSSSSSSSSSSC...", "..CCCCCCCCCCCCCC..", "KKCCLLLLLLLLLLCCKK", "KKCCCCCCCCCCCCCCKK", "KK.CCCCGGGGCCCC.KK", "...CCCCCCCCCCCC...", "KKKCCCWWWWWWCCCKKK", "KkKccCCCCCCCCccKkK", "KkK.cccccccccc.KkK", "KKK..WWWWWWWW..KKK", "KKK............KKK"], ["....SS..................", "...SSS..................", "...SSS..........G.......", "..cSSS.........GG.......", "..CCCCCCCCCCCCCCCC......", ".CCLLLLLLLLLLLLCCCCC....", ".CCCCCCCCCCCCCCCCCCCCC..", ".cCCCWWWCCCCCCCCCCCCCCW.", ".KKKKccccccccccccKKKKcc.", "KKkkKKcccccccccKKkkKK...", "KKkkKK.........KKkkKK...", ".KKKK...........KKKK...."], ["......GGGGGG......", "KKK.CCCCCCCCCC.KKK", "KKKCCCCCCCCCCCCKKK", "...CCCCCCCCCCCC...", "..CSSSSSSSSSSSSC..", "KKCSSSSSSSSSSSSCKK", "KkCCCCCCCCCCCCCCkK", "KkCcccGGGGGGcccCkK", "KkCcccGGGGGGcccCkK", "KKcWWccccccccWWcKK", "KK.cccccccccccc.KK", "KK..............KK"]];
/** Rows from this one down are drawn again on top of the driver, so the driver sits inside the kart. */
const KART_OVERLAY_FROM = [5, 5, 4];
/** Where the bottom of the seated driver goes, relative to the kart's center, per direction. */
export const KART_SEAT = [{ dx: 0, dy: 2 }, { dx: -3, dy: 2 }, { dx: 0, dy: 1 }];

function kart(color: string, dir: number, overlay: boolean): HTMLCanvasElement {
  const map = KART_MAPS[dir];
  const rows = overlay ? map.map((r, y) => (y < KART_OVERLAY_FROM[dir] ? ".".repeat(r.length) : r)) : map;
  const palette: Record<string, string> = {
    C: color, c: shade(color, -0.35), L: shade(color, 0.4),
    K: "#1d1d24", k: "#4a4a58", G: "#9a9aa8", W: "#f0f0f5", S: "#2b2b33",
  };
  return canvas(map[0].length + 2, map.length + 2, (c) => drawMap(c, rows, (ch) => palette[ch]));
}

/** Draws a character with a dark outline and a ground shadow. gender: 0 male, 1 female. */
export function character(gender: number, shirt: string, frame: number, view = VIEW_FRONT): HTMLCanvasElement {
  return canvas(CHARACTER_W, CHARACTER_H, (c) => {
    drawCharacter(c, CHARACTER_MAPS[gender][view][frame], shirt);
    c.globalCompositeOperation = "destination-over";
    c.fillStyle = "rgba(0,0,0,0.28)";
    c.beginPath();
    c.ellipse(CHARACTER_W / 2, 23.5, 7, 2.3, 0, 0, Math.PI * 2);
    c.fill();
  });
}

/** The same character from the waist up, for sitting in a kart. */
function seated(gender: number, shirt: string, view: number): HTMLCanvasElement {
  return canvas(CHARACTER_W, SEATED_H, (c) => {
    drawCharacter(c, CHARACTER_MAPS[gender][view][0].slice(0, SEATED_ROWS), shirt);
  });
}

function cone(): HTMLCanvasElement {
  return canvas(10, 12, (c) => {
    rect(c, "#c2410c", 0, 10, 10, 2);
    rect(c, "#f97316", 2, 7, 6, 3);
    rect(c, "#f97316", 3, 3, 4, 4);
    rect(c, "#f97316", 4, 0, 2, 3);
    rect(c, "#fff", 3, 4, 4, 1);
    rect(c, "#fff", 2, 8, 6, 1);
  });
}

function grass(): HTMLCanvasElement {
  return canvas(64, 64, (c) => {
    const rnd = seededRandom(3);
    rect(c, "#5a9236", 0, 0, 64, 64);
    for (let i = 0; i < 70; i++) {
      rect(c, rnd() < 0.5 ? "#528730" : "#66a13f", Math.floor(rnd() * 64), Math.floor(rnd() * 64), 2, 1);
    }
  });
}

function tree(): HTMLCanvasElement {
  return canvas(30, 34, (c) => {
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.beginPath(); c.ellipse(15, 30, 10, 3, 0, 0, Math.PI * 2); c.fill();
    rect(c, "#6b4a2b", 13, 22, 4, 9);
    c.fillStyle = "#2f7d3c";
    c.beginPath(); c.arc(15, 14, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#3f9a4a";
    c.beginPath(); c.arc(13, 12, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#57b560";
    c.beginPath(); c.arc(11, 9, 4, 0, Math.PI * 2); c.fill();
  });
}

function bush(): HTMLCanvasElement {
  return canvas(18, 12, (c) => {
    c.fillStyle = "#3f8f45";
    c.beginPath(); c.ellipse(9, 7, 9, 5, 0, 0, Math.PI * 2); c.fill();
    for (const [x, y] of [[4, 4], [9, 3], [13, 5], [7, 7]]) rect(c, "#fff", x, y, 2, 2);
  });
}

function gate(): HTMLCanvasElement {
  return canvas(8, TRACK_W, (c) => {
    for (let y = 0; y < TRACK_W; y += 11) rect(c, (y / 11) % 2 ? "#fff" : "#d6303a", 0, y, 8, 11);
    rect(c, "rgba(0,0,0,0.25)", 6, 0, 2, TRACK_W);
  });
}

/** Shadow strip drawn past the lip of a ramp. */
const RAMP_SHADOW = 7;

/** A ramp pointing right, `lanes` wide: bands that get lighter towards the lip, with a shadow behind it. */
function ramp(lanes: number): HTMLCanvasElement {
  const h = lanes * LANE_W;
  return canvas(RAMP_LEN + 2 + RAMP_SHADOW, h + 2, (c) => {
    rect(c, "rgba(0,0,0,0.3)", RAMP_LEN + 1, 3, RAMP_SHADOW, h - 4);
    rect(c, "#2a2630", 0, 0, RAMP_LEN + 2, h + 2);
    const bands = 7, bandW = RAMP_LEN / bands;
    for (let i = 0; i < bands; i++) rect(c, shade("#f08a24", -0.45 + i * 0.09), 1 + i * bandW, 2, bandW, h - 2);
    rect(c, "#fff3c4", RAMP_LEN - 2, 2, 3, h - 2);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth = 3;
    const mid = h / 2 + 1, arm = Math.min(12, h / 2 - 6);
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(9 + i * 14, mid - arm);
      c.lineTo(9 + i * 14 + arm * 0.8, mid);
      c.lineTo(9 + i * 14, mid + arm);
      c.stroke();
    }
  });
}
/** Origin of a ramp texture that matches the ramp's start point on its center line. */
export const RAMP_ORIGIN_X = 1 / (RAMP_LEN + 2 + RAMP_SHADOW);

function checker(c: Ctx, x: number, y: number, cols: number, rows: number, size: number): void {
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) rect(c, (i + j) % 2 ? "#3a3a44" : "#eef0f6", x + i * size, y + j * size, size, size);
  }
}

function track(): HTMLCanvasElement {
  return canvas(WORLD_W, WORLD_H, (c) => {
    const RED = "#d95763";
    const path = () => {
      c.beginPath();
      c.moveTo(CENTER[0].x, CENTER[0].y);
      for (let i = 1; i < CENTER.length; i++) c.lineTo(CENTER[i].x, CENTER[i].y);
    };
    const stroke = (color: string, width: number) => {
      path();
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    };

    // Scenery on the grass, kept clear of the track.
    const rnd = seededRandom(11);
    const treeImg = tree(), bushImg = bush();
    const spots: { x: number; y: number; t: boolean }[] = [];
    for (let i = 0; i < 320; i++) {
      const x = 20 + rnd() * (WORLD_W - 40), y = 30 + rnd() * (WORLD_H - 60);
      const isTree = rnd() < 0.65;
      if (project(x, y).d > HALF_W + 52) spots.push({ x, y, t: isTree });
    }
    spots.sort((a, b) => a.y - b.y);
    for (const s of spots) {
      if (s.t) c.drawImage(treeImg, Math.round(s.x - 15), Math.round(s.y - 30));
      else c.drawImage(bushImg, Math.round(s.x - 9), Math.round(s.y - 6));
    }

    c.lineJoin = "round";
    c.lineCap = "round";
    stroke("#3a3a44", TRACK_W + 26);
    stroke("#f2b632", TRACK_W + 16);
    c.lineCap = "butt";
    c.setLineDash([9, 9]);
    stroke("#2b2b2b", TRACK_W + 16);
    c.setLineDash([]);
    c.lineCap = "round";
    stroke(RED, TRACK_W);
    for (let k = 4; k >= 1; k--) {
      stroke("#f1c9cf", 2 * k * LANE_W + 1.5);
      stroke(RED, 2 * k * LANE_W - 1.5);
    }
    stroke("#f1c9cf", 1.5);

    // Paddock pavement before the starting grid.
    c.save();
    c.beginPath();
    c.rect(0, 0, GATE_X - 112, WORLD_H / 2);
    c.clip();
    c.beginPath();
    c.moveTo(CENTER[0].x, CENTER[0].y);
    c.lineTo(GATE_X, START_Y);
    c.strokeStyle = "#8f8c97";
    c.lineWidth = TRACK_W;
    c.stroke();
    c.restore();
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.font = "bold 20px monospace";
    c.textAlign = "center";
    c.fillText("PADDOCK", 400, START_Y - 70);
    c.font = "bold 12px monospace";
    c.fillText("pick a kart  >>>", 560, START_Y + 6);

    // Starting grid boxes.
    c.strokeStyle = "rgba(255,255,255,0.75)";
    c.lineWidth = 1;
    for (let k = 0; k < KART_COUNT; k++) {
      const h = homeSlot(k);
      c.strokeRect(h.x - 13.5, h.y - 9.5, 27, 19);
    }

    // Start line, gate posts, finish line.
    checker(c, GATE_X + 3, START_Y - HALF_W, 2, 20, 11);
    rect(c, "#2a2a35", GATE_X - 5, START_Y - HALF_W - 12, 10, 12);
    rect(c, "#2a2a35", GATE_X - 5, START_Y + HALF_W, 10, 12);
    const f = pointAt(FINISH_S);
    // The finish straight runs east or west; put the label on the side the karts come from.
    checker(c, f.dx > 0 ? f.x : f.x - 22, f.y - HALF_W, 2, 20, 11);
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.font = "bold 22px monospace";
    c.fillText("FINISH", f.x - f.dx * 54, f.y + 8);

    // Direction chevrons.
    c.strokeStyle = "rgba(255,255,255,0.32)";
    c.lineWidth = 3;
    c.lineCap = "butt";
    c.lineJoin = "miter";
    for (let s = GATE_S + 220; s < FINISH_S - 200; s += 520) {
      const p = pointAt(s);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.atan2(p.dy, p.dx));
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(i * 10 - 14, -9);
        c.lineTo(i * 10 - 5, 0);
        c.lineTo(i * 10 - 14, 9);
        c.stroke();
      }
      c.restore();
    }
  });
}

/** Builds every texture, keyed by the name the scene uses. */
export function buildTextures(): Record<string, HTMLCanvasElement> {
  const out: Record<string, HTMLCanvasElement> = {
    grass: grass(),
    track: track(),
    cone: cone(),
    gate: gate(),
    ramp2: ramp(2),
    ramp3: ramp(3),
    ramp4: ramp(4),
    shadow: canvas(24, 10, (c) => {
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.beginPath();
      c.ellipse(12, 5, 12, 5, 0, 0, Math.PI * 2);
      c.fill();
    }),
  };
  KART_COLORS.forEach((color, i) => {
    for (let dir = 0; dir < 3; dir++) {
      out[`kart${i}_${dir}`] = kart(color, dir, false);
      out[`kartf${i}_${dir}`] = kart(color, dir, true);
    }
  });
  for (let g = 0; g < GENDERS.length; g++) {
    SHIRT_COLORS.forEach((color, i) => {
      for (let view = 0; view < 3; view++) {
        for (let f = 0; f < 3; f++) out[`char${g}_${i}_${view}_${f}`] = character(g, color, f, view);
        out[`seat${g}_${i}_${view}`] = seated(g, color, view);
      }
    });
  }
  return out;
}
