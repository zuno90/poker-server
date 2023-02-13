import { Client, Room } from 'colyseus';
import { Request } from 'express';
import { ERound, RoomState } from './schemas/room.schema';
import { ERole, EStatement, Player } from './schemas/player.schema';
import { ROOM_CHAT, ROOM_DISPOSE, START_GAME } from './constants/room.constant';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, RANK, RESULT } from './constants/server-emit.constant';
import { deal } from './modules/handleCard';
import { parseUserFromJwt } from '../utils/jwtChecking';
import { arrangeSeat, arrangeTurn } from './modules/handlePlayer';
import { calculateAllinPlayer, checkPlayerRank } from './modules/handleRank';
import { BotClient } from './BotGPT';
import { botInfo } from './constants/bot.constant';
import { sleep } from '../utils/sleep';
import { updateChip } from '../services/game.service';

const Hand = require('pokersolver').Hand; // func handle winner

type TJwtAuth = {
  jwt: string;
  isBot?: boolean;
};

type TRoomChat = {
  username: string;
  avatar: string;
  message: string;
};

export interface TAllinPlayer {
  i: string;
  t: number;
  v: number;
  w?: boolean;
}

export default class GameRoom extends Room<RoomState> {
  private bot: Map<string, BotClient> | null = new Map<string, BotClient>(); // new bot
  readonly maxClients: number = 5;
  private readonly MIN_CHIP = 1000;
  private readonly initBetChip: number = 100;
  private betChip: number = 0; // chỉ gán cho action RAISE và ALLIN
  private banker5Cards: Array<string> = [];
  private player2Cards: Array<string[]> = [];
  private remainingTurn: number;

  private allinArr: TAllinPlayer[] = [];
  private allinValue: number = 0;

  async onAuth(_: Client, options: TJwtAuth, req: Request) {
    // is BOT
    if (this.state.players.size === 1 && options.isBot && !options.jwt) return botInfo;
    // IS REAL PLAYER -> CHECK AUTH
    const existedPlayer = await parseUserFromJwt(options.jwt);
    // is HOST
    if (!this.state.players.size)
      return {
        id: existedPlayer.id,
        username: existedPlayer.username ?? existedPlayer.email,
        chips: existedPlayer.chips,
        isHost: true,
        seat: 1,
        turn: 0,
        role: ERole.Player,
      };
    // IS NOT HOST AND PLAYER NUMBER > 2
    if (this.state.players.size >= 2) {
      let playerSeatArr: number[] = [];
      this.state.players.forEach((player: Player, _) => playerSeatArr.push(player.seat));
      // find out next seat for this player
      const nextSeat = arrangeSeat(playerSeatArr); // next seat - 1 = 1

      return {
        id: existedPlayer.id,
        username: existedPlayer.username ?? existedPlayer.email,
        chips: existedPlayer.chips,
        isHost: false,
        seat: nextSeat,
        role: ERole.Player,
      };
    }
    throw new Error('Có sự lỗi giữa việc real player vào room trước con bot!');
  }

  async onCreate(options: TJwtAuth) {
    try {
      // CREATE AN INITIAL ROOM STATE
      this.setState(new RoomState());

      // CHANGE ROOM STATE WHEN ALL USERS GET READY
      await this.handleRoomState();

      // HANDLE CHAT ROOM
      this.handleChat();

      // HANDLE ALL ACTION FROM PLAYER
      this.handleAction();
    } catch (err) {
      console.error(err);
    }
  }

  async onJoin(client: Client, options: TJwtAuth, player: Player) {
    // SET INITIAL PLAYER STATE
    if (player.chips < this.MIN_CHIP) throw new Error('Đéo có tiền thì cút!');
    if (player.isHost) {
      this.state.players.set(client.sessionId, new Player(player)); // set host and bot first
      return await this.addBot();
    }
    return this.state.players.set(client.sessionId, new Player(player)); // set player every joining
  }

  async onLeave(client: Client, consented: boolean) {
    const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    if (!leavingPlayer) throw new Error('Have no any player including sessionId!');
    // check bot leave
    if (leavingPlayer.statement === EStatement.Playing)
      throw new Error('Please wait until end game!');
    if (leavingPlayer.role === ERole.Bot) {
      console.log('bot ' + client.sessionId + ' has just left');
      this.state.players.delete(client.sessionId);
      if (this.state.players.size < 2) await this.addBot(); // add new BOT
      return;
    }
    if (leavingPlayer.role === 'Player') await updateChip(leavingPlayer.id, leavingPlayer.chips);
    if (leavingPlayer.isHost && this.state.players.size >= 2) {
      // handle change host & delete bot
      this.state.players.forEach((player: Player, _) => {
        if (player.turn === 1) {
          player.isHost = true;
          player.seat = 1;
          player.turn = 0;
        }
      });
    }
    console.log('client ' + client.sessionId + ' has just left');
    return this.state.players.delete(client.sessionId);
    // leavingPlayer.connected = false;
    // try {
    //   // update chip
    //   if (leavingPlayer.role === 'Player') await updateChip(leavingPlayer.id, leavingPlayer.chips);
    //   // allow disconnected client to reconnect into this room until 20 seconds
    //   const reconnection = await this.allowReconnection(client, 10);
    //   // client returned! let's re-activate it.
    //   leavingPlayer.connected = true;
    // } catch (e) {
    //   // 10 seconds expired. let's remove the client.
    //   this.state.players.delete(client.sessionId);
    //   console.log('client ' + client.sessionId + ' has just left');
    // }
  }

  async onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
    this.bot = null;
    this.broadcast(ROOM_DISPOSE, 'room bi dispose');
  }

  // HANDLE ALL ACTIONS
  private async handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, (client: Client, _) => this.startGame(client));
  }

  // handle chat
  private handleChat() {
    this.onMessage(ROOM_CHAT, (client: Client, data: TRoomChat) => {
      this.broadcast(ROOM_CHAT, data);
    });
  }

  private handleAction() {
    // RAISE
    this.onMessage(RAISE, (client: Client, { chips }: { chips: number }) => {
      const player = <Player>this.checkBeforeAction(client);
      // check chips
      if (chips < this.betChip / 2) return;
      player.action = RAISE;
      player.accumulatedBet += chips;
      player.betEachAction = chips;
      player.chips -= chips;

      this.betChip = chips;
      this.state.potSize += chips;
      this.state.currentTurn = player.turn;

      this.remainingTurn = this.state.remainingPlayer - 1;
      console.log('raise:::::', this.remainingTurn);
    });
    // CALL
    this.onMessage(CALL, (client: Client) => {
      console.log('chip dang bet hien tai:::::', this.betChip);
      const player = <Player>this.checkBeforeAction(client);
      let callValue: number;
      if (player.action === RAISE && player.betEachAction < this.betChip) {
        callValue = this.betChip - player.betEachAction;
      } else {
        callValue = this.betChip;
      }

      player.action = CALL;
      player.accumulatedBet += callValue;
      player.chips -= callValue;

      this.state.potSize += callValue;
      this.state.currentTurn = player.turn;

      this.remainingTurn--;
      console.log('call:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.handleEndEachRound(this.state.round);
    });
    // CHECK
    this.onMessage(CHECK, (client: Client) => {
      const player = <Player>this.checkBeforeAction(client);
      player.action = CHECK;

      this.state.currentTurn = player.turn;

      this.remainingTurn--;
      console.log('check:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.handleEndEachRound(this.state.round);
    });
    // ALLIN
    this.onMessage(ALLIN, (client: Client) => {
      const player = <Player>this.checkBeforeAction(client);
      const allinAmount = player.chips; // chip cua player t
      player.action = ALLIN;
      player.accumulatedBet += allinAmount;
      player.chips = 0; // trừ sạch tiền

      this.betChip += allinAmount;
      this.state.potSize += allinAmount;
      this.state.currentTurn = player.turn;

      this.allinArr.push({ i: client.sessionId, t: player.turn, v: allinAmount });

      this.remainingTurn = this.state.remainingPlayer - 1;
      this.state.remainingPlayer--;

      console.log(this.remainingTurn, 'turn all in con lai');

      console.log('allin:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.isLastAllin();
    });
    // FOLD
    this.onMessage(FOLD, (client: Client, _) => {
      const player = <Player>this.checkBeforeAction(client);
      player.action = FOLD;
      player.isFold = true;

      this.state.currentTurn = player.turn;

      console.log(this.state.remainingPlayer);
      this.state.remainingPlayer--;
      if (this.state.remainingPlayer === 1) {
        console.log('con 1ng');
        this.isFoldAll();
        return;
      }

      this.remainingTurn--;
      console.log('fold:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.handleEndEachRound(this.state.round);
    });
  }

  // internal function
  private send2Cards() {
    this.clients.forEach((client: Client, _) => {
      const player = <Player>this.state.players.get(client.sessionId);
      const rankInfo = checkPlayerRank([
        {
          sessionId: client.sessionId,
          combinedCards: [...this.state.bankerCards].concat([...this.player2Cards[player.turn]]),
        },
      ]);
      client.send(DEAL, {
        r: rankInfo[0].rank,
        d: rankInfo[0].name,
        c: this.player2Cards[player.turn],
      });
    });
  }

  private checkBeforeAction(client: Client) {
    if (!this.state.onReady) throw new Error('Game is not ready!');
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player || player.isFold)
      throw new Error('Can not find Player! Player is invalid or folded!');
    if (player.statement === 'Waiting') throw new Error('định cheat hả mày?');
    return player;
  }

  private async handleEndEachRound(round: ERound) {
    // check winner first (river -> showdown)
    if (round === ERound.RIVER) {
      this.state.round = ERound.SHOWDOWN;
      const resArr = await this.pickWinner();
      this.broadcast(RESULT, resArr);
      await sleep(10);
      return this.resetGame();
    }
    // preflop -> flop
    if (round === ERound.PREFLOP) {
      this.state.round = ERound.FLOP;
      this.state.bankerCards = [...this.banker5Cards.slice(0, 3)];
    }
    // flop -> turn
    if (round === ERound.FLOP) {
      this.state.round = ERound.TURN;
      this.state.bankerCards = [...this.banker5Cards.slice(0, 4)];
    }
    // turn -> river
    if (round === ERound.TURN) {
      this.state.round = ERound.RIVER;
      this.state.bankerCards = [...this.banker5Cards];
    }
    this.betChip = 0;
    this.remainingTurn = this.state.remainingPlayer;
    for (const p of this.state.players.values()) {
      if (p.statement === 'Playing') p.betEachAction = 0;
    }
    return this.sendRankEachRound();
  }

  private sendRankEachRound() {
    this.clients.forEach((client: Client, _) => {
      const player = <Player>this.state.players.get(client.sessionId);
      const rankInfo = checkPlayerRank([
        {
          sessionId: client.sessionId,
          combinedCards: [...this.state.bankerCards].concat([...this.player2Cards[player.turn]]),
        },
      ]);
      if (!player.isFold) return client.send(RANK, { r: rankInfo[0].rank, d: rankInfo[0].name });
    });
  }

  private async pickWinner(action?: string) {
    let winCardsArr: any[] = [];
    let resultArr: any[] = [];
    this.state.players.forEach((player: Player, sessionId: string) => {
      if (!player.isFold) {
        const rankInfo = checkPlayerRank([
          {
            sessionId,
            combinedCards: [...this.banker5Cards].concat([...this.player2Cards[player.turn]]),
          },
        ]);
        winCardsArr.push(rankInfo[0]);
        resultArr.push({
          t: player.turn,
          c: this.player2Cards[player.turn],
          d: rankInfo[0].name,
          i: rankInfo[0].sessionId,
        });
      }
    });

    // handle winner tại đây và show kết quả
    const winHand = Hand.winners(winCardsArr)[0];
    const winPlayer = <Player>this.state.players.get(winHand.sessionId);
    // check action
    if (action === ALLIN) {
      for (const allinPlayer of this.allinArr) {
        if (allinPlayer.i === winHand.sessionId) allinPlayer.w = true;
      }
      const remainingAllinArr = await calculateAllinPlayer(this.allinArr);
      for (const r of remainingAllinArr) {
        console.log('kết quả của ông pha', r);
        const p = <Player>this.state.players.get(r.i);
        p.chips = r.v;
      }
    } else {
      winPlayer.chips += this.state.potSize; // update lai chip cho winner
    }
    for (const result of resultArr) {
      if (winHand.sessionId === result.i) result.w = true;
      delete result.i;
    }
    return resultArr;
  }

  private startGame(client: Client) {
    // check game is ready or not
    if (this.state.onReady) return;
    // check accept only host
    const host = <Player>this.state.players.get(client.sessionId);
    if (!host.isHost) return; // accept only host

    const { onHandCards, banker5Cards } = deal(this.state.players.size);
    this.banker5Cards = banker5Cards; // cache 5 cards of banker first
    this.player2Cards = onHandCards; // chia bai
    this.remainingTurn = this.state.players.size;

    console.log({ banker: this.banker5Cards, player: this.player2Cards });

    this.state.onReady = true; // change room state -> TRUE
    this.state.round = ERound.PREFLOP;
    this.state.potSize = this.state.players.size * this.initBetChip;
    this.state.remainingPlayer = this.state.players.size;
    const randomTurn = Math.round((Math.random() * 10) % (this.state.players.size - 1));
    this.state.currentTurn = randomTurn - 1;

    // initialize state of player

    let playerSeatArr: number[] = [];
    this.state.players.forEach((player: Player, _) => {
      player.statement = EStatement.Playing;
      player.accumulatedBet += this.initBetChip;
      player.chips -= this.initBetChip;
      playerSeatArr.push(player.seat);
    });
    // gán turn vào
    this.state.players.forEach(
      (player: Player, _) => (player.turn = arrangeTurn(player.seat, playerSeatArr) as number),
    );
    // send to player 2 cards
    this.send2Cards();
  }

  private resetGame() {
    // ông nào còn dưới 1000 chíp thì chim cút
    this.clients.forEach(async (client: Client, index: number) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.chips < this.MIN_CHIP) await client.leave(1001);
    });
    // global variables
    this.banker5Cards = [];
    this.player2Cards = [];
    this.allinValue = 0;
    // room state
    this.state.onReady = false;
    this.state.round = ERound.WELCOME;
    this.state.potSize = 0;
    this.state.bankerCards = [];
    this.state.remainingPlayer = 0;
    this.state.currentTurn = undefined;
    // player state
    this.state.players.forEach((player: Player, sessionId: string) => {
      const newPlayer = {
        id: player.id,
        username: player.username,
        isHost: player.isHost,
        chips: player.chips,
        action: null,
        accumulatedBet: 0,
        betEachAction: 0,
        turn: player.turn,
        seat: player.seat,
        role: player.role,
        statement: EStatement.Waiting,
        connected: player.connected,
        isFold: false,
      };
      this.state.players.set(sessionId, new Player(newPlayer));
    });
  }

  // handle special cases
  private async isLastAllin() {
    console.log('tính tiền luôn, thằng cuối nó allin rồi');
    this.state.round = ERound.SHOWDOWN;
    this.state.bankerCards = this.banker5Cards;

    const resArr = await this.pickWinner(ALLIN);
    // bắn kết quả về cho all clients
    this.broadcast(RESULT, resArr);
    await sleep(10);
    return this.resetGame();
  }

  private isFoldAll() {
    console.log('tính tiền luôn, còn có thằng kia ah!');
    this.state.round = ERound.SHOWDOWN;
    this.state.players.forEach(async (player: Player, _) => {
      if (!player.isFold) {
        player.chips += this.state.potSize;
        this.broadcast(RESULT, [{ t: player.turn, w: true }]);
        await sleep(10);
        return this.resetGame();
      }
    });
  }

  private async addBot() {
    const bot = new BotClient(
      process.env.NODE_ENV === 'production' ? `${process.env.WS_SERVER}` : 'ws://localhost:9000',
    );
    await bot.joinRoom(this.roomId);
    this.bot?.set(bot.sessionId, bot);
  }
}
