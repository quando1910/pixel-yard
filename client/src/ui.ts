// DOM overlay: name popup, HUD, name labels, tooltip, countdown.
import { NAME_MAX, validName } from "@pixelyard/shared";
import { character, GENDERS, SHIRT_COLORS } from "./art";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const modal = $("modal");
const nameForm = $<HTMLFormElement>("nameForm");
const nameInput = $<HTMLInputElement>("nameInput");
const nameBtn = $<HTMLButtonElement>("nameBtn");
const labels = $("labels");
const tooltip = $("tooltip");
const hud = $("hud");
const timerEl = $("timer");
const phaseEl = $("phase");
const boardEl = $("board");
const adminEl = $("admin");
const btnStart = $<HTMLButtonElement>("btnStart");
const btnEnd = $<HTMLButtonElement>("btnEnd");
const hintEl = $("hint");
const muteBtn = $<HTMLButtonElement>("mute");
const countdownEl = $("countdown");
const statusEl = $("status");

export function askName(): Promise<{ name: string; gender: number }> {
  modal.classList.remove("hidden");
  // Character picker: one button per gender with a preview of the sprite.
  let gender = 0;
  const pick = $("genderPick");
  const options = GENDERS.map((label, g) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.append(character(g, SHIRT_COLORS[g === 0 ? 3 : 7], 0), label);
    btn.addEventListener("click", () => {
      gender = g;
      options.forEach((o, i) => o.classList.toggle("sel", i === g));
      nameInput.focus();
    });
    pick.appendChild(btn);
    return btn;
  });
  options[0].classList.add("sel");
  nameInput.maxLength = NAME_MAX;
  nameInput.focus();
  const check = () => (nameBtn.disabled = validName(nameInput.value) === null);
  nameInput.addEventListener("input", check);
  check();
  return new Promise((resolve) => {
    nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = validName(nameInput.value);
      if (!name) return;
      modal.classList.add("hidden");
      nameInput.blur();
      resolve({ name, gender });
    });
  });
}

export function showStatus(text: string | null): void {
  statusEl.classList.toggle("hidden", text === null);
  if (text !== null) statusEl.textContent = text;
}

export function showHud(isAdmin: boolean, onStart: () => void, onEnd: () => void): void {
  hud.classList.remove("hidden");
  adminEl.classList.toggle("hidden", !isAdmin);
  btnStart.addEventListener("click", () => { onStart(); btnStart.blur(); });
  btnEnd.addEventListener("click", () => { onEnd(); btnEnd.blur(); });
}

export function setAdminButtons(canStart: boolean, canEnd: boolean): void {
  btnStart.disabled = !canStart;
  btnEnd.disabled = !canEnd;
}

// Flat single-color speaker icons.
const SPEAKER = '<path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/>';
const svg = (extra: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${SPEAKER}${extra}</svg>`;
const ICON_SOUND = svg('<path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>');
const ICON_MUTED = svg('<path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/>');

export function onMute(handler: () => boolean, muted: boolean): void {
  const paint = (m: boolean) => {
    muteBtn.innerHTML = m ? ICON_MUTED : ICON_SOUND;
    muteBtn.title = m ? "Unmute music" : "Mute music";
    muteBtn.style.opacity = m ? "0.6" : "1";
  };
  paint(muted);
  muteBtn.addEventListener("click", () => { paint(handler()); muteBtn.blur(); });
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100, s = Math.floor(total / 100) % 60, m = Math.floor(total / 6000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

let lastTimer = "";
export function setTimer(ms: number): void {
  const text = formatTime(ms);
  if (text !== lastTimer) timerEl.textContent = lastTimer = text;
}

let lastPhase = "";
export function setPhase(text: string): void {
  if (text !== lastPhase) phaseEl.textContent = lastPhase = text;
}

export interface BoardRow { pos: string; name: string; value: string; me: boolean }

export function setBoard(title: string | null, rows: BoardRow[]): void {
  boardEl.textContent = "";
  if (title) {
    const li = document.createElement("li");
    li.className = "title";
    li.textContent = title;
    boardEl.appendChild(li);
  }
  for (const row of rows) {
    const li = document.createElement("li");
    if (row.me) li.className = "me";
    for (const [cls, text] of [["pos", row.pos], ["name", row.name], ["val", row.value]]) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      li.appendChild(span);
    }
    boardEl.appendChild(li);
  }
}

let lastHint = "";
export function setHint(text: string): void {
  if (text === lastHint) return;
  lastHint = text;
  hintEl.textContent = text;
  hintEl.classList.toggle("hidden", text === "");
}

export function setCountdown(text: string | null): void {
  countdownEl.classList.toggle("hidden", text === null);
  if (text !== null && countdownEl.textContent !== text) countdownEl.textContent = text;
}

export function createLabel(name: string, isMe: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = isMe ? "label me" : "label";
  el.textContent = name;
  labels.appendChild(el);
  return el;
}

/** Places an overlay element so it is centered above the screen point. */
export function placeAbove(el: HTMLElement, x: number, y: number): void {
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
}

export function setTooltip(x: number, y: number, visible: boolean): void {
  tooltip.classList.toggle("hidden", !visible);
  if (visible) placeAbove(tooltip, x, y);
}

/** Zoom controls: the +/- buttons and the mouse wheel. The handler receives a zoom multiplier. */
export function onZoom(handler: (factor: number) => void): void {
  const box = $("zoom");
  box.classList.remove("hidden");
  const bind = (id: string, factor: number) => {
    const btn = $<HTMLButtonElement>(id);
    btn.addEventListener("click", () => { handler(factor); btn.blur(); });
  };
  bind("zoomIn", 1.25);
  bind("zoomOut", 0.8);
  window.addEventListener("wheel", (e) => {
    // Let the leaderboard scroll normally.
    if (e.target instanceof Element && e.target.closest("#hud")) return;
    e.preventDefault();
    handler(Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
}
