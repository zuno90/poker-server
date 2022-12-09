import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import GameRoom from "./game/Room";
import initDatabase from "./init/db";
import { authRouter } from "./routers/auth.router";
import { userRouter } from "./routers/user.router";
import { bestHands } from "./game/modules/rank";

async function bootstrap() {
  const app: Express = express();

  await initDatabase(); // init DB

  app.use(cors());
  app.use(express.json());

  app.use("/assets", express.static("./src/assets")); // public file if need

  app.use("/monitor", monitor()); // room monitor

  const Hand = require("pokersolver").Hand;

  // var hand1 = Hand.solve(["Ad", "As", "Jc", "Th", "2d", "3c", "Kd"]);
  // var hand2 = Hand.solve(["Ad", "As", "Jc", "Th", "2d", "Qs", "Qd"]);
  // var hand3 = Hand.solve(["Ad", "As", "Ac", "Th", "2d", "Qs", "Qd"]);
  // var hand4 = Hand.solve(["Ad", "As", "Qc", "Th", "2d", "Qs", "Qd"]);
  // var hand5 = Hand.solve(["Ad", "As", "Jc", "Qh", "2d", "Qs", "Qd"]);
  // var winner = Hand.winners([hand1, hand2, hand3, hand4, hand5]); // hand2
  // console.log({
  //   h1: hand1,
  //   h2: hand2,
  //   h3: hand3,
  //   h4: hand4,
  //   h5: hand5,
  // });
  // console.log(winner);

  // const x = bestHands(["Ad As Jc Th 2d 5c Kd", "Ad As 4c Th Qd Qs 3d"]);
  // console.log("result", x);

  // router
  app.use("/auth", authRouter);
  app.use("/user", userRouter);

  // welcome
  app.use("/", (req: Request, res: Response) => {
    return res.send("Hello from ZUNO");
  });

  // init game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createServer(app) }),
  });

  gameServer.define("desk", GameRoom);

  const SERVER_IP = process.env.SERVER_IP || "175.41.154.239";
  const PORT = process.env.PORT || 9000;
  gameServer.listen(+PORT);
  console.log(
    `🚀 Server is ready at htpp://${SERVER_IP}:${PORT} and ws://${SERVER_IP}:${PORT} 🚀`
  );
}

bootstrap();
