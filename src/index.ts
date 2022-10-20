import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import GameRoom from "./Room";
import initDatabase from "./init/db";
import { authRouter } from "./routers/auth.router";

async function bootstrap() {
  const PORT = process.env.PORT || 9000;
  const app = express();

  await initDatabase(); // init DB

  app.use(cors());
  app.use(express.json());

  app.use(express.static("./src/public")); // public file if need

  app.use("/monitor", monitor()); // room monitor

  // auth router
  app.use("/auth", authRouter);

  // init game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createServer(app) }),
  });

  gameServer.define("desk", GameRoom);

  gameServer.listen(+PORT);
  console.log(
    `🚀 Server is ready at htpp://localhost:${PORT} and ws://localhost:${PORT} 🚀`
  );
}

bootstrap();
