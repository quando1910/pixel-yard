import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME, SERVER_PORT } from "@pixelyard/shared";
import { RaceRoom } from "./RaceRoom";

const app = express();

// In production the server also serves the built client, so one process is enough.
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (existsSync(clientDist)) app.use(express.static(clientDist));

// Health check for deploys and uptime monitors. APP_VERSION is set by the deploy (the release tag).
const version = process.env.APP_VERSION || "dev";
app.get("/health", (_req, res) => res.json({ ok: true, version }));

// CLIENT_ORIGIN (comma-separated) limits which websites may call the matchmaker; unset allows any origin.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
if (allowedOrigins.length > 0) {
  const defaults = matchMaker.controller.DEFAULT_CORS_HEADERS;
  matchMaker.controller.getCorsHeaders = (req) => {
    const origin = req.headers.origin;
    return {
      ...defaults,
      "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      Vary: "Origin",
    };
  };
}

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_NAME, RaceRoom);

const port = Number(process.env.PORT) || SERVER_PORT;
// HOST=127.0.0.1 in production so only the local Cloudflare Tunnel can reach the server; unset listens everywhere.
const host = process.env.HOST || undefined;
gameServer.listen(port, host).then(() => console.log(`Pixelyard server ${version} listening on ${host ?? "*"}:${port}`));
