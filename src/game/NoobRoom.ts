import { Client, Delayed, Room } from 'colyseus';
import { Request } from 'express';
import { ERound, RoomState } from './schemas/room.schema';
import { ERole, EStatement, Player } from './schemas/player.schema';
import { ALL, FRIEND_REQUEST, ROOM_CHAT, START_GAME } from './constants/room.constant';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { RANK, RESULT } from './constants/server-emit.constant';
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

export default class NoobRoom extends Room<RoomState> {
  public readonly maxClients: number = 5;
  private readonly MIN_BET = 1000;
  private readonly MIN_CHIP = 50000; // 150000
  private readonly MAX_CHIP = 200000;
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
      if (options.isBot && !options.jwt) return botInfo(this.roomName);
      // IS REAL PLAYER -> CHECK AUTH
      const auth = await this.checkAuth(options.jwt);
      if (!auth.success) return client.leave();
      const existedPlayer = auth.data;

      // check user to kick
      if (existedPlayer.chips < this.MIN_CHIP && existedPlayer > this.MAX_CHIP)
        return client.leave();
      for (const p of this.state.players.values()) {
        if (existedPlayer._id === p.id) return client.leave();
      }

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
      if (this.state.players.size > 0) {
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

      // HANDLE FRIEND REQUEST
      this.handleFriendRequest();

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
      this.state.players.set(client.sessionId, new Player(player)); // set player every joining
      if (player.isHost) return this.clock.setTimeout(() => this.addBot(), 2000);
      return this.sendNewState();
    } catch (err) {
      console.error(err);
    }
  }

  async onLeave(client: Client, consented: boolean) {
    try {
      const leavingPlayer = <Player>this.state.players.get(client.sessionId);
      leavingPlayer.connected = false;
      if (leavingPlayer.role === ERole.Bot) {
        console.log('bot ' + client.sessionId + ' has just left');
        this.state.players.delete(client.sessionId);
        return this.clock.setTimeout(() => {
          this.addBot();
        }, 2000);
      }

      // handle change host to player
      const playerInRoom: any[] = [];
      if (leavingPlayer.isHost) {
        this.state.players.forEach((player: Player, sessionId: string) => {
          if (player.role === ERole.Player) {
            playerInRoom.push({ sessionId, seat: player.seat });
          }
        });

        console.log('so player con lai without Bot', playerInRoom);

        if (playerInRoom.length === 1) return await this.disconnect();
        if (playerInRoom.length > 1) {
          const newHost = <Player>this.state.players.get(playerInRoom[1].sessionId);
          newHost.isHost = true;
          newHost.seat = 1;
          newHost.turn = 0;
          this.sendNewState();
        }
      }
      if (consented) throw new Error('consented leave!');
      // allow disconnected client to reconnect into this room until 20 seconds
      await this.allowReconnection(client, 10);

      // client returned! let's re-activate it.
      leavingPlayer.connected = true;
    } catch (err) {
      console.log('client ' + client.sessionId + ' has just left');
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
    this.bot = null;
  }

  // HANDLE ALL ACTIONS
  private async handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, (client: Client, _) => {
      this.startGame(client);
      console.log('current turn', this.currentBet);
      this.sendNewState();
    });
  }

  // handle chat
  private handleChat() {
    this.onMessage(ROOM_CHAT, (client: Client, data: TRoomChat) => {
      if (!data) return;
      this.clients.forEach((client: Client, index: number) => {
        client.send(ROOM_CHAT, data);
      });
    });
  }

  // handle friend request

  private handleFriendRequest() {
    this.onMessage(FRIEND_REQUEST, async (client: Client, toId: string) => {
      // get sessionId of toPlayer
      let acceptUser: any;
      this.state.players.forEach((player: Player, sessionId: string) => {
        if (player.id === toId) acceptUser = { sessionId, id: player.id };
      });

      const reqUser = <Player>this.state.players.get(client.sessionId);
      if (!reqUser || !acceptUser) return;

      await this.presence.publish('poker:friend:request', { from: reqUser.id, to: acceptUser.id });
      this.clients.forEach((c: Client, _: number) => {
        if (c.sessionId === acceptUser.sessionId)
          c.send(FRIEND_REQUEST, `Thằng ${client.sessionId} add friend mày kìa!`);
      });
      await this.presence.subscribe('cms:friend:accept', (data: any) => {
        console.log(data);
      });
    });
  }

  private handleAction() {
    // RAISE
    this.onMessage(RAISE, (client: Client, { chips }: { chips: number }) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return; // không cho gửi 2 lần
      if (player.isFold) return; // block folded player

      console.log('chip raise', chips);

      if (chips < this.MIN_BET) return;

      // if (chips >= player.chips) return this.allinAction(client.sessionId, player, player.chips); // trường hợp này chuyển sang allin
      // if (this.currentBet > chips + player.accumulatedBet + this.MIN_BET) return; // chỉ cho phép raise lệnh cao hơn current bet + min bet
      this.raiseAction(player, chips);

      this.sendNewState();
    });
    // CALL
    this.onMessage(CALL, (client: Client) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.isFold) return; // block folded player
      if (this.state.currentTurn === -1) return;

      let callValue = 0;

      if (this.currentBet < player.chips + player.accumulatedBet) {
        callValue = this.currentBet - player.accumulatedBet;
      }
      if (player.chips < this.currentBet - player.accumulatedBet) {
        // buộc phải all in
        callValue = player.chips;
        return this.allinAction(client.sessionId, player, callValue);
      }

      console.log({ chip: player.chips, callValue, currentbet: this.currentBet });

      if (callValue === 0) return this.checkAction(player);
      this.callAction(player, callValue);

      this.sendNewState();
    });
    // CHECK
    this.onMessage(CHECK, (client: Client) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.isFold) return; // block folded player

      this.checkAction(player);

      this.sendNewState();
    });
    // ALLIN
    this.onMessage(ALLIN, (client: Client) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.isFold) return; // block folded player

      this.allinAction(client.sessionId, player, player.chips);

      this.sendNewState();
    });
    // FOLD
    this.onMessage(FOLD, (client: Client, _) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.isFold) return; // block folded player

      this.foldAction(player);

      this.sendNewState();
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
      client.send(RANK, {
        r: rankInfo[0].rank,
        d: rankInfo[0].name,
        c: this.player2Cards[player.turn],
      });
    });
  }

  private async changeNextRound(round: ERound) {
    // check winner first (river -> showdown)
    if (round === ERound.RIVER) {
      // this.state.round = ERound.SHOWDOWN;
      this.state.bankerCards = this.banker5Cards;
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const betPlayer = <Player>this.state.players.get(c.i);
        betPlayer.chips += c.v;
      }
      return this.endGame(emitResultArr);
    }
    this.currentBet = 0;
    this.remainingTurn = this.state.remainingPlayer;
    this.allinArr = [];
    for (const player of this.state.players.values())
      if (player.statement === 'Playing') player.betEachAction = 0;
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
    return this.clock.setTimeout(() => this.emitRank(), 2000);
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
    if (this.state.round !== ERound.WELCOME) return; // phai doi toi round welcome
    if (this.state.players.size < 2) return; // allow start game when > 2 players
    // check accept only host
    const host = <Player>this.state.players.get(client.sessionId);
    if (!host.isHost) return;

    const { onHandCards, banker5Cards } = deal(this.state.players.size);
    this.banker5Cards = banker5Cards; // cache 5 cards of banker first
    this.player2Cards = onHandCards; // chia bai
    this.remainingTurn = this.state.players.size;

    console.log({ banker: this.banker5Cards, player: this.player2Cards });

    this.state.onReady = true; // change room state -> TRUE
    this.state.potSize = this.state.players.size * this.MIN_BET;
    this.state.remainingPlayer = this.state.players.size;
    const randomTurn = Math.round((Math.random() * 10) % (this.state.players.size - 1));
    this.state.currentTurn = randomTurn - 1;

    // initialize state of player

    const playerSeatArr: number[] = [];
    this.state.players.forEach((player: Player, _) => {
      player.statement = EStatement.Playing;
      player.accumulatedBet += this.MIN_BET;
      player.chips -= this.MIN_BET;
      playerSeatArr.push(player.seat);
    });

    // gán turn vào
    this.state.players.forEach((player: Player, _) => {
      player.turn = arrangeTurn(player.seat, playerSeatArr) as number;
      this.remainingPlayerArr = sortedArr([...this.remainingPlayerArr, player.turn]);
    });
    this.emitDealCards();
    this.state.round = ERound.PREFLOP;
  }

  private resetGame() {
    // ông nào còn dưới 1000 chíp thì chim cút
    this.clients.forEach(async (client: Client, index: number) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.chips < this.MIN_CHIP) await client.leave();
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

    if (this.currentBet < player.accumulatedBet) this.currentBet = player.accumulatedBet;

    this.remainingTurn = this.state.remainingPlayer - 1;
    console.log('RAISE, turn con', this.remainingTurn);
  }

  private callAction(player: Player, chip: number) {
    player.action = CALL;
    player.betEachAction = chip;
    player.accumulatedBet += chip;
    player.chips -= chip;

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;

    this.remainingTurn--;
    console.log('CALL, turn con', { id: player.id, remainturn: this.remainingTurn });
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
    player.accumulatedBet += chip;
    player.chips -= chip;

    if (player.accumulatedBet > this.currentBet) {
      this.currentBet = player.accumulatedBet;
      this.remainingTurn = this.state.remainingPlayer - 1;
    } else {
      this.remainingTurn--;
    }
    this.state.remainingPlayer--;

    console.log('current bet', this.currentBet);
    console.log('chip bet', chip);

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;

    this.allinArr.push(player.turn);
    this.allinList.push({ i: sessionId, t: player.turn, v: player.accumulatedBet });

    console.log('ALLIN, turn con', this.remainingTurn);

    const mergeArr = [...this.remainingPlayerArr, ...this.allinArr, ...this.foldArr];
    const remainTurn = getNonDupItem(mergeArr);

    // allin đầu
    if (this.state.remainingPlayer === 1) {
      let result: any[] = [];
      const betP: any[] = [];
      this.state.players.forEach((p: Player, sessionId: string) => {
        if (p.statement === EStatement.Playing && !p.isFold)
          betP.push({ i: sessionId, t: p.turn, v: p.accumulatedBet });
      });
      for (const bet of betP) {
        if (bet.t === remainTurn[0]) {
          const remainP = <Player>this.state.players.get(bet.i);
          if (remainP.accumulatedBet > this.currentBet) {
            const { emitResultArr, finalCalculateResult } = this.pickWinner1();
            result = emitResultArr;
            for (const c of finalCalculateResult) {
              const betPlayer = <Player>this.state.players.get(c.i);
              betPlayer.chips += c.v;
            }
          }
        }
      }
      if (result.length > 0) {
        this.state.bankerCards = this.banker5Cards;
        return this.endGame(result);
      }
    }

    // hết player
    if (this.state.remainingPlayer === 0) {
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const betPlayer = <Player>this.state.players.get(c.i);
        betPlayer.chips += c.v;
      }
      this.state.bankerCards = this.banker5Cards;
      return this.endGame(emitResultArr);
    }
    // allin turn cuối và còn có 1 ng chơi
    if (this.remainingTurn === 0 && this.state.remainingPlayer === 1) {
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const betPlayer = <Player>this.state.players.get(c.i);
        betPlayer.chips += c.v;
      }
      this.state.bankerCards = this.banker5Cards;
      return this.endGame(emitResultArr);
    }
    // allin cuối xong và còn nhiều người chơi
    if (this.remainingTurn === 0 && this.state.remainingPlayer > 1)
      return this.changeNextRound(this.state.round);
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

    let result: any[] = [];
    const betP: any[] = [];
    this.state.players.forEach((p: Player, sessionId: string) => {
      if (p.statement === EStatement.Playing && !p.isFold)
        betP.push({ i: sessionId, t: p.turn, v: p.accumulatedBet });
    });
    if (this.state.remainingPlayer === 1) {
      if (betP.length === 1) {
        const winner = <Player>this.state.players.get(betP[0].i);
        winner.chips += this.state.potSize;
        result = [{ t: betP[0].t, w: true }];
        return this.endGame(result);
      }
      if (betP.length > 1) {
        const betVal: number[] = [];
        for (const b of betP) betVal.push(b.v);
        for (const bet of betP) {
          if (bet.t === remainTurn[0] && Math.max(...betVal) === bet.v) {
            const { emitResultArr, finalCalculateResult } = this.pickWinner1();
            result = emitResultArr;
            for (const c of finalCalculateResult) {
              const betPlayer = <Player>this.state.players.get(c.i);
              betPlayer.chips += c.v;
            }
          }
        }
        return this.endGame(result);
      }
    }
    if (this.remainingTurn === 0 && this.state.remainingPlayer === 0) {
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const betPlayer = <Player>this.state.players.get(c.i);
        betPlayer.chips += c.v;
      }
      this.state.bankerCards = this.banker5Cards;
      return this.endGame(emitResultArr);
    }
    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);
  }

  private async checkAuth(jwt: string) {
    try {
      const res = await axios.get(
        `${
          process.env.NODE_ENV === 'production' ? process.env.CMS_URL : 'http://localhost:9001'
        }/user`,
        {
          headers: { Authorization: 'Bearer ' + jwt },
        },
      );
      return res.data;
    } catch (err) {}
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
        }
        calculateResultArr.push({
          i: sessionId,
          t: player.turn,
          v: player.accumulatedBet,
        });
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

  private endGame(result: any[]) {
    console.log('end game');
    this.clock.start();
    this.emitResult(result);
    this.state.round = ERound.SHOWDOWN;
    this.delayedTimeOut = this.clock.setTimeout(() => {
      this.sendNewState();
    }, 5000);

    this.clock.setTimeout(() => {
      this.delayedTimeOut.clear();
      this.state.players.forEach((player: Player, _: string) => {
        if (player.role === ERole.Player) {
          this.presence.publish(
            'poker:update:chip',
            JSON.stringify({ id: player.id, chips: player.chips }),
          );
        }
      });
      this.resetGame();
      console.log('reset game');
      this.sendNewState();
    }, 10000);
  }

  private async addBot() {
    if (this.clients.length === this.maxClients) return;
    const bot = new BotClient(
      process.env.NODE_ENV === 'production' ? `${process.env.WS_SERVER}` : 'ws://localhost:9000',
    );
    await bot.joinRoom(this.roomId, this.roomName);
    this.bot?.set(bot.sessionId, bot);
    this.sendNewState();
  }

  private sendNewState() {
    this.clients.forEach((client: Client, index: number) => {
      client.send(ALL, this.state);
    });
  }
}
