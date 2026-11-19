import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT } from "@race/shared";
import { RaceRoom } from "./RaceRoom";

const app = express();

// In production the server also serves the built client, so one process is enough.
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(clientDist)) app.use(express.static(clientDist));

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_NAME, RaceRoom);

const port = Number(process.env.PORT) || SERVER_PORT;
gameServer.listen(port).then(() => console.log(`Race server listening on :${port}`));
