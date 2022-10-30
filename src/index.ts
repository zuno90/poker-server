import express, { Express, Request, Response } from "express";
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
import { userRouter } from "./routers/user.router";

async function bootstrap() {
  const PORT = process.env.PORT || 9000;
  const app: Express = express();

  await initDatabase(); // init DB

  app.use(cors());
  app.use(express.json());

  app.use("/assets", express.static("./src/assets")); // public file if need

  app.use("/monitor", monitor()); // room monitor

  // auth router
  app.use("/auth", authRouter);
  app.use("/user", userRouter);

  app.use("/", (req: Request, res: Response) => {
    return res.send("Hello from ZUNO");
  });

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
