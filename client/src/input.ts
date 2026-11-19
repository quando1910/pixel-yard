// Keyboard state: arrow keys or WASD to move, X to get on or off a kart.
const down = new Set<string>();
let onAction: (() => void) | null = null;

const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement;

window.addEventListener("keydown", (e) => {
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (MOVE_KEYS.has(e.code)) {
    down.add(e.code);
    e.preventDefault();
  } else if (e.code === "KeyX" && !e.repeat) {
    onAction?.();
  }
});
window.addEventListener("keyup", (e) => down.delete(e.code));
window.addEventListener("blur", () => down.clear());

export function setActionHandler(handler: () => void): void {
  onAction = handler;
}

export function readDirection(): [number, number] {
  const right = down.has("ArrowRight") || down.has("KeyD") ? 1 : 0;
  const left = down.has("ArrowLeft") || down.has("KeyA") ? 1 : 0;
  const dn = down.has("ArrowDown") || down.has("KeyS") ? 1 : 0;
  const up = down.has("ArrowUp") || down.has("KeyW") ? 1 : 0;
  return [right - left, dn - up];
}
