import Phaser from "phaser";
import { C, ROOM_FULL, validName } from "@pixelyard/shared";
import { audio } from "./audio";
import { connect } from "./net";
import { GameScene } from "./scene";
import * as ui from "./ui";

const NAME_KEY = "playerName";
const GENDER_KEY = "playerGender";
/** Admin key for this browser, set by hand: localStorage.setItem("adminKey", "<key>"). The local dev server accepts "dev". */
const ADMIN_KEY = "adminKey";

async function boot(): Promise<void> {
  ui.onMute(() => audio.toggleMute(), audio.muted);
  let name = validName(sessionStorage.getItem(NAME_KEY));
  if (!name) {
    const picked = await ui.askName();
    name = picked.name;
    sessionStorage.setItem(NAME_KEY, name);
    sessionStorage.setItem(GENDER_KEY, String(picked.gender));
  }
  const gender = sessionStorage.getItem(GENDER_KEY) === "1" ? 1 : 0;
  audio.unlock();

  let net;
  try {
    net = await connect(name, gender, localStorage.getItem(ADMIN_KEY), () => {
      // Connection lost: the name is still in session storage, so a reload rejoins.
      ui.showStatus("Disconnected. Reconnecting…");
      setTimeout(() => location.reload(), 2000);
    });
  } catch (err) {
    console.error(err);
    const full = String((err as { message?: unknown })?.message ?? err).includes(ROOM_FULL);
    ui.showStatus(full
      ? "Pixelyard is full right now. Reload the page in a little while."
      : "Cannot reach the race server. Reload the page to try again.");
    return;
  }

  // Lettering on the track is painted once onto a canvas, so the web font has to be ready first.
  // If it cannot load (offline, blocked), carry on with the fallback font.
  await Promise.race([
    document.fonts.load("bold 20px Orbitron").catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  const room = net.room;
  ui.showHud(net.isAdmin, () => room.send(C.start), () => room.send(C.end));

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#5a9236",
    pixelArt: true,
    audio: { noAudio: true },
    input: { keyboard: false },
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: new GameScene(net),
  });
}

boot();
