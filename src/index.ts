import express, { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import cors from 'cors';
import { RedisPresence, Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { RedisDriver } from '@colyseus/redis-driver';
import { createServer } from 'http';
import NoobRoom from './game/NoobRoom';
import MidRoom from './game/MidRoom';
import ProRoom from './game/ProRoom';
import TestRoom from './game/TestRoom';
import DrawRoom from './game/DrawRoom';

const Hand = require('pokersolver').Hand;

dotenv.config();

async function bootstrap() {
  const app: Express = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors({ origin: '*', credentials: true }));
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
    try {
      const [h1, h2] = req.body;

      let listCardsGame = [];
      const hand1 = Hand.solve(h1);
      const hand2 = Hand.solve(h2);

      const winner = Hand.winners([hand1, hand2]); // hand2

      listCardsGame.push(hand1.cards, hand2.cards);

      const winnerCards = winner[0].cards;

      const winnArr: any[] = [];

      for (let c of winnerCards) {
        winnArr.push(c.value);
      }

      // console.log("WWIN: ", winnArr);
      let player: any;
      y(listCardsGame);

      function y(cards: any[]) {
        let a = [];
        for (let i = 0; i < cards.length; i++) {
          a.push([]);
        }
        let count = 0;
        console.log('COMBO CARD WIN: ', winnArr);
        for (let j = 0; j < cards.length; j++) {
          a[j] = cards[j].map((card: any) => card.value);
          // console.log(a[j], " : ", winnArr);

          if (a[j].toString() === winnArr.toString()) {
            console.log('USER HAVE COMBO CARD WIN: ', a[j]);
            a = a[j];
            count++;
          }
        }
        player = count;
      }

      const result = player === 1 ? `có 1 người thắng` : `kết quả hoà`;

      res.status(200).json({
        success: true,
        data: {
          winnArr,
          result,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(404).json({ err: 404, msg: 'bad request!' });
    }

    // return res.send(`Hello from ZUNO from Websocket ${process.env.websocket}`);
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
  });

  // define each level of Room
  gameServer.define('noob', NoobRoom);
  gameServer.define('normal', MidRoom);
  gameServer.define('pro', ProRoom);

  gameServer.define('test', TestRoom);
  gameServer.define('draw', DrawRoom);

  const SERVER_URL = process.env.SERVER_URL || 'poker.dadsnetwork.net';
  const PORT = process.env.PORT || 9000;
  await gameServer.listen(+PORT);

  console.log(`🚀 Server is ready at https://${SERVER_URL} and wss://${SERVER_URL} 🚀`);
  gameServer.onShutdown(() => console.log('Master process is being shut down!'));
}

bootstrap();
