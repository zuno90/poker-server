import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { RedisPresence, Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { RedisDriver } from '@colyseus/redis-driver';
import { createServer } from 'http';
import GameRoom from './game/Room';
import initDatabase from './init/db';
import { authRouter } from './routers/auth.router';
import { userRouter } from './routers/user.router';

dotenv.config();

async function bootstrap() {
  const app: Express = express();

  await initDatabase(); // init DB

  app.use(cors());
  app.use(express.json());

  app.use('/assets', express.static('./src/assets')); // public file if you need some static file (url, image,...)

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
    presence: new RedisPresence({
      url: process.env.NODE_ENV === 'production' ? process.env.REDIS_URL : 'redis://localhost:6379',
    }),
    driver: new RedisDriver({
      url: process.env.NODE_ENV === 'production' ? process.env.REDIS_URL : 'redis://localhost:6379',
    }),
    // driver: new MongooseDriver(
    //   process.env.NODE_ENV === 'production'
    //     ? process.env.MONGO_URI
    //     : `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27017`,
    // ),
  });

  // define each level of Room
  gameServer.define('noob', GameRoom);
  gameServer.define('normal', GameRoom);
  gameServer.define('pro', GameRoom);

  const SERVER_IP = process.env.SERVER_IP || '175.41.154.239';
  const PORT = process.env.PORT || 9000;
  await gameServer.listen(+PORT);

  console.log(`🚀 Server is ready at http://${SERVER_IP}:${PORT} and ws://${SERVER_IP}:${PORT} 🚀`);
  gameServer.onShutdown(() => {
    console.log('Master process is being shut down!');
  });
}

bootstrap();
