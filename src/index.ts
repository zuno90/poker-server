import express, { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cors from 'cors';
import { RedisPresence, Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { RedisDriver } from '@colyseus/redis-driver';
import { createServer } from 'http';
import GameRoom from './game/Room';
import RoomGame from './game/RoomGame';

dotenv.config();

async function bootstrap() {
  const app: Express = express();

  app.use(cors());
  app.use(express.json());
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100000,
  });
  app.use('/matchmake/', apiLimiter);
  app.set('trust proxy', 1);

  app.use('/assets', express.static('./src/assets')); // public file if you need some static file (url, image,...)

  app.use('/monitor', monitor()); // room monitor

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
