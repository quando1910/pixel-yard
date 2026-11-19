import Phaser from "phaser";
import { C, validName } from "@race/shared";
import { audio } from "./audio";
import { connect } from "./net";
import { GameScene } from "./scene";
import * as ui from "./ui";

const NAME_KEY = "playerName";
const GENDER_KEY = "playerGender";
const ADMIN_KEY = "isAdmin";

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
    net = await connect(name, gender, localStorage.getItem(ADMIN_KEY) === "1", () => {
      // Connection lost: the name is still in session storage, so a reload rejoins.
      ui.showStatus("Disconnected. Reconnecting…");
      setTimeout(() => location.reload(), 2000);
    });
  } catch (err) {
    console.error(err);
    ui.showStatus("Cannot reach the race server. Reload the page to try again.");
    return;
  }

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
