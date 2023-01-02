import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();
import cors from 'cors';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import GameRoom from './game/Room';
import initDatabase from './init/db';
import { authRouter } from './routers/auth.router';
import { userRouter } from './routers/user.router';
import { User } from './models/user.model';

async function bootstrap() {
  const app: Express = express();

  await initDatabase(); // init DB

  app.use(cors());
  app.use(express.json());

  app.use('/assets', express.static('./src/assets')); // public file if need

  app.use('/monitor', monitor()); // room monitor

  // router
  app.use('/auth', authRouter);
  app.use('/user', userRouter);

  // welcome
  app.use('/', async (req: Request, res: Response) => {
    return res.send('Hello from ZUNO');
  });

  // init game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createServer(app) }),
  });

  gameServer.define('noob', GameRoom);
  gameServer.define('normal', GameRoom);
  gameServer.define('pro', GameRoom);

  const SERVER_IP = process.env.SERVER_IP || '175.41.154.239';
  const PORT = process.env.PORT || 9000;
  gameServer.listen(+PORT);
  console.log(`🚀 Server is ready at http://${SERVER_IP}:${PORT} and ws://${SERVER_IP}:${PORT} 🚀`);
}

bootstrap();
