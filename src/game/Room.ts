import { Client, Delayed, Room } from 'colyseus';
import { Request } from 'express';
import { ERound, RoomState } from './schemas/room.schema';
import { ERole, EStatement, Player } from './schemas/player.schema';
import { ROOM_CHAT, START_GAME } from './constants/room.constant';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, RANK, RESULT } from './constants/server-emit.constant';
import { deal } from './modules/handleCard';
import { arrangeSeat, arrangeTurn, getNonDupItem, sortedArr } from './modules/handlePlayer';
import { calculateAllinPlayer, checkPlayerRank } from './modules/handleRank';
import { BotClient } from './BotGPT';
import { botInfo } from './constants/bot.constant';
import axios from 'axios';

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

export default class RoomGame extends Room<RoomState> {
  readonly maxClients: number = 5;
  private readonly MIN_CHIP = 1000;
  private readonly initBetChip: number = 100;
  private currentBet: number = 0;
  private banker5Cards: Array<string> = [];
  private player2Cards: Array<string[]> = [];
  private remainingPlayerArr: number[] = [];
  private remainingTurn: number;
  private allinArr: number[] = [];
  private allinList: TAllinPlayer[] = [];
  private foldArr: number[] = [];

  private bot: Map<string, BotClient> | null = new Map<string, BotClient>(); // new bot

  public delayedTimeOut!: Delayed;

  async onAuth(client: Client, options: TJwtAuth, req: Request) {
    try {
      // is BOT
      if (options.isBot && !options.jwt) return botInfo();
      // IS REAL PLAYER -> CHECK AUTH
      const res = await axios.get(
        `${
          process.env.NODE_ENV === 'production' ? process.env.CMS_URL : 'http://localhost:9001'
        }/user/info`,
        {
          headers: { Authorization: 'Bearer ' + options.jwt },
        },
      );

      if (!res.data.success) return client.leave(1001);
      const existedPlayer = res.data.data;
      if (existedPlayer.chips < this.MIN_CHIP)
        throw new Error('This room is required for ' + this.MIN_CHIP);
      if (!this.state.players.size)
        // is HOST
        return {
          id: existedPlayer._id,
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
          id: existedPlayer._id,
          username: existedPlayer.username ?? existedPlayer.email,
          chips: existedPlayer.chips,
          isHost: false,
          seat: nextSeat,
          role: ERole.Player,
        };
      }
      throw Error('Bot is on room -> dispose room!');
    } catch (err) {
      console.error(err);
      await this.disconnect();
    }
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
      console.error('error:::::', err);
      await this.disconnect();
    }
  }

  async onJoin(client: Client, options: TJwtAuth, player: Player) {
    // SET INITIAL PLAYER STATE
    try {
      if (player.isHost) {
        this.state.players.set(client.sessionId, new Player(player)); // set host and bot first
        await this.addBot();
        return;
      }
      return this.state.players.set(client.sessionId, new Player(player)); // set player every joining
    } catch (err) {
      console.error(err);
    }
  }

  async onLeave(client: Client, consented: boolean) {
    try {
      const leavingPlayer = <Player>this.state.players.get(client.sessionId);
      console.log('client ' + client.sessionId + ' has just left');
      await this.presence.publish(
        'poker:update:chip',
        JSON.stringify({ id: leavingPlayer.id, chips: leavingPlayer.chips }),
      );
      this.state.players.delete(client.sessionId);
      if (leavingPlayer.role === ERole.Bot) {
        console.log('bot ' + client.sessionId + ' has just left');
        this.state.players.delete(client.sessionId);
        if (this.state.players.size <= 2) await this.addBot();
        return;
      }
      // handle change host to player
      const seatArr: any[] = [];
      if (leavingPlayer.isHost) {
        this.state.players.forEach((player: Player, sessionId: string) => {
          if (player.role === ERole.Player) seatArr.push({ sessionId, seat: player.seat });
        });
        if (seatArr.length === 0) throw Error('Không còn người trong room!');
        if (seatArr.length === 1) {
          const newHost = <Player>this.state.players.get(seatArr[0].sessionId);
          newHost.isHost = true;
          newHost.seat = 1;
          newHost.turn = 0;
        }
        if (seatArr.length > 1) {
          const newHost = <Player>this.state.players.get(seatArr[1].sessionId);
          newHost.isHost = true;
          newHost.seat = 1;
          newHost.turn = 0;
        }
      }
    } catch (err) {
      console.error(err);
      return await this.disconnect();
    }
  }

  async onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
    this.bot = null;
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
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return; // không cho gửi 2 lần
      // if (this.state.currentTurn === Math.max(...this.remainingPlayerArr)) {
      //   const nextTurn = Math.min(...this.remainingPlayerArr);
      //   if (nextTurn !== player.turn) return;
      // }

      if (this.currentBet > chips / 2) return; // chỉ cho phép raise lệnh hơn 2 lần current bet
      if (player.chips <= chips) return this.allinAction(client.sessionId, player, chips); // trường hợp này chuyển sang allin

      this.raiseAction(player, chips);
    });
    // CALL
    this.onMessage(CALL, (client: Client) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (this.state.currentTurn === -1) return;
      // if (this.state.currentTurn === Math.max(...this.remainingPlayerArr)) {
      //   const nextTurn = Math.min(...this.remainingPlayerArr);
      //   if (nextTurn !== player.turn) return;
      // }
      let callValue = 0;
      if (player.betEachAction === 0) {
        // tại round mới và nó chưa action gì
        callValue = this.currentBet;
      } else if (player.betEachAction > 0 && player.betEachAction < this.currentBet) {
        // có đứa raise cao hơn
        callValue = this.currentBet - player.betEachAction;
      }

      // nếu lệnh call này >= chip nó đang còn
      if (callValue >= player.chips) return this.allinAction(client.sessionId, player, callValue);

      return this.callAction(player, callValue);
    });
    // CHECK
    this.onMessage(CHECK, (client: Client) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      // if (this.state.currentTurn === Math.max(...this.remainingPlayerArr)) {
      //   const nextTurn = Math.min(...this.remainingPlayerArr);
      //   if (nextTurn !== player.turn) return;
      // }

      this.checkAction(player);
    });
    // ALLIN
    this.onMessage(ALLIN, (client: Client) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      // if (this.state.currentTurn === Math.max(...this.remainingPlayerArr)) {
      //   const nextTurn = Math.min(...this.remainingPlayerArr);
      //   if (nextTurn !== player.turn) return;
      // }

      this.allinAction(client.sessionId, player, player.chips);
    });
    // FOLD
    this.onMessage(FOLD, (client: Client, _) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;

      this.foldAction(player);
    });
  }

  // internal function
  private emitDealCards() {
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

  private async changeNextRound(round: ERound) {
    // check winner first (river -> showdown)
    if (round === ERound.RIVER) {
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const allinPlayer = <Player>this.state.players.get(c.i);
        allinPlayer.chips = c.v;
      }
      return this.endGame(emitResultArr);
    }
    this.currentBet = 0;
    this.remainingTurn = this.state.remainingPlayer;
    this.allinArr = [];
    for (const player of this.state.players.values()) {
      if (player.statement === 'Playing') player.betEachAction = 0;
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

    return this.emitRank();
  }

  private emitRank() {
    this.clients.forEach((client: Client, _) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.statement === EStatement.Playing && !player.isFold) {
        const rankInfo = checkPlayerRank([
          {
            sessionId: client.sessionId,
            combinedCards: [...this.state.bankerCards].concat([...this.player2Cards[player.turn]]),
          },
        ]);
        return client.send(RANK, { r: rankInfo[0].rank, d: rankInfo[0].name });
      }
    });
  }

  private startGame(client: Client) {
    if (this.state.onReady) return; // check game is ready or not
    // check accept only host
    const host = <Player>this.state.players.get(client.sessionId);
    if (!host.isHost) return;

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

    const playerSeatArr: number[] = [];
    this.state.players.forEach((player: Player, _) => {
      player.statement = EStatement.Playing;
      player.accumulatedBet += this.initBetChip;
      player.chips -= this.initBetChip;
      playerSeatArr.push(player.seat);
    });

    // gán turn vào
    this.state.players.forEach((player: Player, _) => {
      player.turn = arrangeTurn(player.seat, playerSeatArr) as number;
      this.remainingPlayerArr = sortedArr([...this.remainingPlayerArr, player.turn]);
    });
    // send to player 2 cards
    this.clock.setTimeout(() => {
      this.emitDealCards();
    }, 2000);
  }

  private resetGame() {
    // ông nào còn dưới 1000 chíp thì chim cút
    this.clients.forEach(async (client: Client, index: number) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.chips < this.MIN_CHIP) await client.leave(1001);
    });
    // global variables
    this.currentBet = 0;
    this.banker5Cards = [];
    this.player2Cards = [];
    this.remainingPlayerArr = [];
    this.allinArr = [];
    this.allinList = [];
    this.foldArr = [];

    // room state
    this.state.onReady = false;
    this.state.round = ERound.WELCOME;
    this.state.potSize = 0;
    this.state.bankerCards = [];
    this.state.remainingPlayer = 0;
    this.state.currentTurn = 6969;

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

  private raiseAction(player: Player, chip: number) {
    player.action = RAISE;
    player.betEachAction = chip;
    player.accumulatedBet += chip;
    player.chips -= chip;

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;

    this.currentBet = chip;

    this.remainingTurn = this.state.remainingPlayer - 1;
    console.log('RAISE, turn con', this.remainingTurn);
  }

  private callAction(player: Player, chip: number) {
    if (chip === 0) return this.checkAction(player);
    player.action = CALL;
    player.betEachAction = chip;
    console.log('call bet', player.accumulatedBet);
    player.accumulatedBet += chip;
    player.chips -= chip;

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;

    this.remainingTurn--;
    console.log('CALL, turn con', this.remainingTurn);
    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);
  }

  private checkAction(player: Player) {
    player.action = CHECK;

    this.state.currentTurn = player.turn;

    this.remainingTurn--;
    console.log('CHECK, turn con', this.remainingTurn);
    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);
  }

  private allinAction(sessionId: string, player: Player, chip: number) {
    player.action = ALLIN;
    player.betEachAction = chip;

    if (chip > this.currentBet) this.currentBet = chip;

    player.betEachAction = chip;
    player.accumulatedBet += chip;
    player.chips -= chip;

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;
    this.state.remainingPlayer--;
    this.remainingTurn--;

    this.allinArr.push(player.turn);
    this.allinList.push({ i: sessionId, t: player.turn, v: player.accumulatedBet });

    console.log('ALLIN, turn con', this.remainingTurn);

    const mergeArr = [...this.remainingPlayerArr, ...this.allinArr, ...this.foldArr];
    const remainTurn = getNonDupItem(mergeArr);

    if (this.state.remainingPlayer === 1) {
      console.log('so ng con 1 vo day');
      const betP: any[] = [];
      this.state.players.forEach((p: Player, sessionId: string) => {
        if (p.statement === EStatement.Playing && !p.isFold) {
          betP.push({ i: sessionId, t: p.turn, v: p.accumulatedBet });
        }
      });
      for (const bet of betP) {
        if (bet.t === remainTurn[0]) {
          const remainP = <Player>this.state.players.get(bet.i);
          if (remainP.accumulatedBet > this.currentBet) {
            console.log('case do day!!!!!!');
            const { emitResultArr, finalCalculateResult } = this.pickWinner1();
            for (const c of finalCalculateResult) {
              const allinPlayer = <Player>this.state.players.get(c.i);
              allinPlayer.chips += c.v;
            }
            return this.endGame(emitResultArr);
          }
        }
      }
    }

    if (this.state.remainingPlayer === 0) {
      console.log('het nguoi roi, tat ca allin');
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const allinPlayer = <Player>this.state.players.get(c.i);
        allinPlayer.chips += c.v;
      }
      return this.endGame(emitResultArr);
    }

    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);
  }

  private foldAction(player: Player) {
    player.action = FOLD;
    player.isFold = true;

    this.state.remainingPlayer--;
    this.remainingTurn--;

    this.foldArr.push(player.turn);

    console.log('FOLD, turn con', this.remainingTurn);

    const mergeArr = [...this.remainingPlayerArr, ...this.allinArr, ...this.foldArr];
    const remainTurn = getNonDupItem(mergeArr);

    if (this.state.remainingPlayer === 1) {
      let result = [];
      // fold all
      const betP: any[] = [];
      this.state.players.forEach((p: Player, sessionId: string) => {
        if (p.statement === EStatement.Playing && !p.isFold) {
          betP.push({ i: sessionId, t: p.turn, v: p.accumulatedBet });
        }
      });
      if (betP.length === 1) {
        result = [{ t: betP[0].t, w: true }];
        return this.endGame(result);
      }
      if (betP.length > 1) {
        const betVal: number[] = [];
        for (const b of betP) betVal.push(b.v);
        for (const bet of betP) {
          if (bet.t === remainTurn[0] && Math.max(...betVal) === bet.v) {
            console.log('da vo dc trong nay fold');
            const { emitResultArr, finalCalculateResult } = this.pickWinner1();
            for (const c of finalCalculateResult) {
              const allinPlayer = <Player>this.state.players.get(c.i);
              allinPlayer.chips += c.v;
            }
            return this.endGame(emitResultArr);
          }
        }
      }
    }

    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);
  }

  private endGame(result: any[]) {
    console.log('end game');
    this.clock.start();
    this.delayedTimeOut = this.clock.setTimeout(() => {
      this.state.round = ERound.SHOWDOWN;
      this.emitResult(result);
    }, 3000);

    this.clock.setTimeout(() => {
      this.delayedTimeOut.clear();
      this.resetGame();
      console.log('reset game');
    }, 10000);
  }

  private pickWinner1() {
    const winCardsArr: any[] = [];
    const emitResultArr: any[] = [];
    const calculateResultArr: any[] = [];
    this.state.players.forEach((player: Player, sessionId: string) => {
      if (player.statement === EStatement.Playing) {
        if (!player.isFold) {
          const rankInfo = checkPlayerRank([
            {
              sessionId,
              combinedCards: [...this.banker5Cards].concat([...this.player2Cards[player.turn]]),
            },
          ]);
          winCardsArr.push(rankInfo[0]);
          emitResultArr.push({
            t: player.turn,
            c: this.player2Cards[player.turn],
            d: rankInfo[0].name,
            i: rankInfo[0].sessionId,
          });
          calculateResultArr.push({
            i: sessionId,
            t: player.turn,
            v: player.accumulatedBet,
          });
        }
      }
    });

    console.log('pick winner trong nay', calculateResultArr);

    // handle winner tại đây và show kết quả
    const winHand = Hand.winners(winCardsArr)[0];
    const winPlayer = <Player>this.state.players.get(winHand.sessionId);
    for (const emitResult of emitResultArr) {
      if (winHand.sessionId === emitResult.i) emitResult.w = true;
      delete emitResult.i;
    }
    for (const calculateResult of calculateResultArr) {
      if (winHand.sessionId === calculateResult.i) calculateResult.w = true;
    }
    // tính toán tiền còn lại mỗi đứa
    const finalCalculateResult = calculateAllinPlayer(calculateResultArr);
    return { winPlayer, emitResultArr, finalCalculateResult };
  }

  private emitResult(result: any[]) {
    this.broadcast(RESULT, result);
  }

  private async addBot() {
    if (this.clients.length === this.maxClients) return;
    const bot = new BotClient(
      process.env.NODE_ENV === 'production' ? `${process.env.WS_SERVER}` : 'ws://localhost:9000',
    );
    await bot.joinRoom(this.roomId);
    return this.bot?.set(bot.sessionId, bot);
  }
}
