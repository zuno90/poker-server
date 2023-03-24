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
import DrawRoom from './game/DrawRoom';

dotenv.config();

const Hand = require('pokersolver').Hand;

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
    console.log(req.body);
    try {
      const [h1, h2, h3, h4, h5] = req.body;
      let listCardsGame = [];
      let hand1 = Hand.solve(h1.cards);
      hand1.color = h1.color;

      let hand2 = Hand.solve(h2.cards);
      hand2.color = h2.color;
      let hand3 = Hand.solve(h3.cards);
      hand3.color = h3.color;
      let hand4 = Hand.solve(h4.cards);
      hand4.color = h4.color;
      let hand5 = Hand.solve(h5.cards);
      hand5.color = h5.color;
      const winner = Hand.winners([hand1, hand2, hand3, hand4, hand5]); // hand2
      listCardsGame.push(hand1.cards, hand2.cards, hand3.cards, hand4.cards, hand5.cards);
      const winnerCards = winner[0].cards;
      const winnArr: any[] = [];
      for (let c of winnerCards) winnArr.push(c.value);
      let drawPlayer: number = 0;

      let result: string = '';
      y(listCardsGame);

      function y(cards: any[]) {
        let a = [];
        for (let i = 0; i < cards.length; i++) a.push([]);
        let count = 0;
        console.log('COMBO CARD WIN: ', winnArr);

        console.log(cards.length);
        for (let j = 0; j < cards.length; j++) {
          a[j] = cards[j].map((card: any) => card.value);
          console.log(a[j]);
          if (a[j].toString() === winnArr.toString()) {
            console.log('USER HAVE COMBO CARD WIN: ', a[j]);
            a = a[j];
            count++;
          }
        }
        drawPlayer = count;
        if (drawPlayer === 1) {
          result = `màu ${winner[0].color} thắng, rank: ${winner[0].descr}`;
        } else {
          const x = winner.map((v: any) => v.color);
          result = `kết quả có ${drawPlayer} hoà, màu ${x.join(' & ')}. Rank: ${winner[0].descr}`;
        }
      }

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
  });

  // init game server
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createServer(app), pingInterval: 0 }),
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
  gameServer.define('noob', NoobRoom);
  gameServer.define('normal', MidRoom);
  gameServer.define('pro', ProRoom);

  gameServer.define('test', TestRoom);
  gameServer.define('draw', DrawRoom);

  const SERVER_URL = process.env.SERVER_URL || 'poker.dadsnetwork.net';
  const PORT = process.env.PORT || 9000;
  await gameServer.listen(+PORT);

  console.log(
    `🚀 Server is ready at https://${SERVER_URL} and wss://${SERVER_URL} port ${+PORT} 🚀`,
  );
  gameServer.onShutdown(() => console.log('Master process is being shut down!'));
}

bootstrap();
