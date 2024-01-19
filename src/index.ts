import express, { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongooseDriver, RedisPresence, Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import CustomLobbyRoom from './game/LobbyRoom';
import NoobRoom from './game/NoobRoom';
import MidRoom from './game/MidRoom';
import ProRoom from './game/ProRoom';
import TestRoom from './game/TestRoom';
import { sendQueue } from './game/init/rabbitmq.init';
import { SystemReport } from './systemReport';

dotenv.config();

const Hand = require('pokersolver').Hand;

async function bootstrap() {
  const app: Express = express();
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors({ origin: '*', credentials: true }));
  const apiLimiter = rateLimit({
    windowMs: 1000 * 60 * 15, // 15 minutes
    max: 10000000,
    message: "You can't make any more requests at the moment. Try again later",
  });
  app.use('/matchmake', apiLimiter);

  app.use('/test', async (req: Request, res: Response) => {
    await sendQueue('history', { who: 'zuno', do: 'test' });
    res.send('work ' + process.env.PORT);
  });

  app.use('/assets', express.static('./src/assets')); // public file if you need some static file (url, image,...)

  app.use('/monitor', monitor()); // room monitor

  // rabbitmq initiation history channe
  // INIT QUEUE CHANNEL
  // await sendQueue('history', { text: 'zuno', concat: 'hahaha' });
  // await consumeQueue('history');

  // init game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createServer(app) }),
    presence: new RedisPresence({
      url: process.env.NODE_ENV === 'production' ? process.env.REDIS_URL : 'redis://localhost:6379',
    }),
    driver: new MongooseDriver(
      process.env.NODE_ENV === 'production'
        ? process.env.MONGO_URI
        : 'mongodb://zuno:zunohandsome@localhost:27017/poker?authSource=admin',
    ),
  });

  // join to Global room after Login
  gameServer.define('lobby', CustomLobbyRoom);

  // define each level of Room
  gameServer.define('test', TestRoom);

  gameServer.define('noob', NoobRoom);
  gameServer.define('normal', MidRoom);
  gameServer.define('pro', ProRoom);

  const SERVER_URL = process.env.SERVER_URL || 'poker.dadsnetwork.net';
  const PORT = process.env.PORT || 9000;
  await gameServer.listen(+PORT);

  console.log(
    `🚀 Server is ready at https://${SERVER_URL} and wss://${SERVER_URL} port ${+PORT} 🚀`,
  );
  gameServer.onShutdown(() => {
    new SystemReport();
  });
}

bootstrap();
