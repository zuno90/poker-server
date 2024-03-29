import { Client, Presence, Room } from 'colyseus';
import { Request } from 'express';
import { ERound, RoomState } from './schemas/room.schema';
import { ERole, EStatement, Player } from './schemas/player.schema';
import {
  ALL,
  FRIEND_CHECK,
  FRIEND_REQUEST,
  KICK_PLAYER,
  RESET_GAME,
  ROOM_CHAT,
  START_GAME,
} from './constants/room.constant';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { RANK, RESULT } from './constants/server-emit.constant';
import { deal } from './modules/handleCard';
import { arrangeSeat, arrangeTurn, getNonDupItem, sortedArr } from './modules/handlePlayer';
import {
  calculateAllinPlayer,
  calculateDraw,
  checkDraw,
  checkPlayerRank,
  pokerSolverHand,
} from './modules/handleRank';
import { BotClient } from './BotGPT';
import { botInfo, botTest } from './constants/bot.constant';
import _ from 'lodash';

const Hand = require('pokersolver').Hand; // func handle winner

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

const getSubChannel = (redis: Presence, channel: string) => {
  return new Promise(resolve => {
    redis.subscribe(channel, (data: any) => {
      resolve(data);
      redis.unsubscribe(channel);
    });
  });
};

export default class TestRoom extends Room<RoomState> {
  public readonly maxClients: number = 5;
  private readonly MIN_BET = 1000;
  private readonly MIN_CHIP = 50000;
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

  async onAuth(client: Client, options: number, req: Request) {
    try {
      return botTest(options);
    } catch (err) {
      console.error(err);
      await this.disconnect();
    }
  }

  async onCreate(options: number) {
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

  async onJoin(client: Client, options: number, player: Player) {
    // SET INITIAL PLAYER STATE
    try {
      this.state.players.set(client.sessionId, new Player(player)); // set player every joining
      if (player.isHost) {
        await this.sleep(2);
        await this.addBot();
      }
      this.sendNewState();
    } catch (err) {
      console.error(err);
    }
  }

  async onLeave(client: Client, consented: boolean) {
    const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    leavingPlayer.connected = false;

    const playerInRoom: any[] = [];
    if (leavingPlayer.isHost) {
      this.state.players.forEach((player: Player, sessionId: string) => {
        if (player.role === ERole.Player) playerInRoom.push({ sessionId, seat: player.seat });
      });
      if (playerInRoom.length === 1) return await this.disconnect();
      if (playerInRoom.length > 1) {
        const newHost = <Player>this.state.players.get(playerInRoom[1].sessionId);
        newHost.isHost = true;
      }
    }
    // con moi bot
    if (this.clients.length === 1) {
      const bot = <Player>this.state.players.get(this.clients[0].sessionId);
      if (bot.role === ERole.Bot) await this.disconnect();
    }

    // disconnect then connect new bot
    try {
      if (consented) throw new Error('consented leave!');
      if (
        !this.state.onReady ||
        leavingPlayer.statement === EStatement.Waiting ||
        leavingPlayer.role === ERole.Bot
      )
        throw new Error('Can leave immediately!');

      console.log('user dang choi, nen giu lai state!');
      // set current turn &
      const playingTurnArr = [];
      for (const p of this.state.players.values()) {
        p.statement === EStatement.Playing && playingTurnArr.push(p.turn);
      }
      const sortedTurn = sortedArr(playingTurnArr);
      if (
        leavingPlayer.turn === Math.min(...sortedTurn) &&
        this.state.currentTurn === Math.max(...sortedTurn)
      ) {
        if (!leavingPlayer.isFold) this.foldAction(leavingPlayer);
      } else if (
        leavingPlayer.turn !== Math.min(...sortedTurn) &&
        leavingPlayer.turn === this.state.currentTurn + 1
      ) {
        if (!leavingPlayer.isFold) this.foldAction(leavingPlayer);
      } else if (leavingPlayer.turn === Math.min(...sortedTurn) && this.state.currentTurn === -1) {
        if (!leavingPlayer.isFold) this.foldAction(leavingPlayer);
      }
    } catch (err) {
      console.log('client ' + client.sessionId + ' has just left ngay lập tức');
      this.state.players.delete(client.sessionId);
    }
    this.sendNewState();
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
    });

    // RESET GAME
    this.onMessage(RESET_GAME, (client: Client, _) => {
      console.log('reset game');
      this.resetGame(client);

      let count = 0;
      let interval: any = setInterval(() => {
        if (count === 3) return clearInterval(interval);
        count++;
        this.broadcast(RESET_GAME, `đếm xuôi ${count}`);
      }, 1000);
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
    // check friend
    this.onMessage(FRIEND_CHECK, async (client: Client, toId: string) => {
      const { reqUser, acceptUser } = <any>this.friendCheck(client, toId);
      this.presence.publish('poker:friend:check', {
        checkFrom: reqUser.id,
        checkTo: acceptUser.id,
      });

      const isFriend = await getSubChannel(this.presence, `cms:friend:check:${reqUser.id}`);
      this.clients.forEach((c: Client, _: number) => {
        if (c.sessionId === acceptUser.sessionId)
          isFriend && c.send(FRIEND_CHECK, `You and ${acceptUser.name} already were friend!`);
      });
    });

    // add friend
    this.onMessage(FRIEND_REQUEST, async (client: Client, toId: string) => {
      const { reqUser, acceptUser } = <any>this.friendCheck(client, toId);

      this.presence.publish('poker:friend:request', { reqFrom: reqUser.id, reqTo: acceptUser.id });

      const notificationId = await getSubChannel(
        this.presence,
        `cms:friend:request:${acceptUser.id}`,
      );
      this.clients.forEach((c: Client, _: number) => {
        if (c.sessionId === acceptUser.sessionId)
          notificationId
            ? c.send(FRIEND_REQUEST, {
                notificationId,
                reqUserId: reqUser.id,
                reqUsername: reqUser.name,
              })
            : c.send(FRIEND_REQUEST, 'Bad request!');
      });
    });
  }

  private handleAction() {
    // RAISE
    this.onMessage(RAISE, (client: Client, { chips }: { chips: number }) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return; // không cho gửi 2 lần
      if (player.statement !== EStatement.Playing) return;
      if (player.isFold) return; // block folded player

      console.log('chip raise', chips);

      if (chips < this.MIN_BET) return;

      // if (chips >= player.chips) return this.allinAction(client.sessionId, player, player.chips); // trường hợp này chuyển sang allin
      // if (this.currentBet > chips + player.accumulatedBet + this.MIN_BET) return; // chỉ cho phép raise lệnh cao hơn current bet + min bet
      this.raiseAction(player, chips);
    });
    // CALL
    this.onMessage(CALL, (client: Client) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.statement !== EStatement.Playing) return;
      if (player.isFold) return; // block folded player
      const actionArr = [];
      for (let p of this.state.players.values()) p.action && actionArr.push(p.action);
      if (!actionArr.length) return;

      // after check
      let callValue = 0;
      console.log({
        currentBet: this.currentBet,
        chips: player.chips,
        accu: player.accumulatedBet,
      });
      // if (this.currentBet < player.chips + player.accumulatedBet) {
      //   callValue = this.currentBet - player.accumulatedBet;
      // }
      // else {
      // callValue = player.chips;// buo allin
      // return this.allinAction(client.sessionId, player, callValue);
      // }
      callValue = this.currentBet - player.accumulatedBet;
      this.callAction(player, callValue);
    });
    // CHECK
    this.onMessage(CHECK, (client: Client) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.statement !== EStatement.Playing) return;
      if (player.isFold) return; // block folded player

      this.checkAction(player);
    });
    // ALLIN
    this.onMessage(ALLIN, (client: Client) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.statement !== EStatement.Playing) return;
      if (player.isFold) return; // block folded player

      this.allinAction(client.sessionId, player, player.chips);
    });
    // FOLD
    this.onMessage(FOLD, (client: Client, _) => {
      if (!this.state.onReady) return; // ko the action if game is not ready
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.turn === this.state.currentTurn) return;
      if (player.statement !== EStatement.Playing) return;
      if (player.isFold) return; // block folded player

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
    this.emitRank();
    if (round !== ERound.WELCOME) this.sendNewState();

    if (round === ERound.PREFLOP || round === ERound.FLOP || round === ERound.TURN)
      this.actionFoldPlayer();
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
    console.log('state room 1', this.state.onReady);
    if (this.state.onReady) return; // check game is ready or not
    console.log('state room 2', this.state.onReady);
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

    this.sendNewState();
  }

  private async resetGame(client: Client) {
    if (this.state.round !== ERound.SHOWDOWN) return; // phai doi toi round welcome
    const host = <Player>this.state.players.get(client.sessionId);
    if (!host.isHost) return; // ko phai host ko cho rs
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
    this.state.currentTurn = -2;

    // kick under min  balance
    this.clients.forEach(async (client: Client, _) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (player.chips < this.MIN_CHIP) {
        client.send(KICK_PLAYER, player.id);
        client.leave(1000);
        if (player.role === ERole.Bot) {
          await this.sleep(2);
          await this.addBot();
        }
      }
    });

    // remove not-connected from state
    this.state.players.forEach((p: Player, sessionId: string) => {
      if (!p.connected) this.state.players.delete(sessionId);
    });

    // player state
    this.state.players.forEach((player: Player, sessionId: string) => {
      const newPlayer = {
        id: player.id,
        name: player.name,
        avatar: player.avatar,
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

    this.sendNewState();
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

    this.sendNewState(); // send state before raise

    if (this.state.remainingPlayer === 1) {
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const betPlayer = <Player>this.state.players.get(c.i);
        betPlayer.chips += c.v;
      }
      this.state.bankerCards = this.banker5Cards;
      return this.endGame(emitResultArr);
    }

    this.actionFoldPlayer();
  }

  private callAction(player: Player, chip: number) {
    player.action = CALL;
    player.betEachAction = chip;
    player.accumulatedBet += chip;
    player.chips -= chip;

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;

    this.remainingTurn--;
    console.log('CALL, turn con', this.remainingTurn);

    this.sendNewState(); // send state before call

    if (this.state.remainingPlayer === 1) {
      const { emitResultArr, finalCalculateResult } = this.pickWinner1();
      for (const c of finalCalculateResult) {
        const betPlayer = <Player>this.state.players.get(c.i);
        betPlayer.chips += c.v;
      }
      this.state.bankerCards = this.banker5Cards;
      return this.endGame(emitResultArr);
    }
    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);

    this.actionFoldPlayer();
  }

  private checkAction(player: Player) {
    player.action = CHECK;

    this.state.currentTurn = player.turn;

    this.remainingTurn--;
    console.log('CHECK, turn con', this.remainingTurn);

    this.sendNewState(); // send state before check

    if (this.remainingTurn === 0) return this.changeNextRound(this.state.round);

    this.actionFoldPlayer();
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

    this.state.currentTurn = player.turn;
    this.state.potSize += chip;

    console.log('ALLIN, turn con', this.remainingTurn);

    this.sendNewState(); // send state before allin

    this.allinArr.push(player.turn);
    this.allinList.push({ i: sessionId, t: player.turn, v: player.accumulatedBet });

    const mergeArr = [...this.remainingPlayerArr, ...this.allinArr, ...this.foldArr];
    const remainTurn = getNonDupItem(mergeArr);

    // allin đầu
    if (this.state.remainingPlayer === 1) {
      let result: any = [];
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

    this.actionFoldPlayer();
  }

  private foldAction(player: Player) {
    player.action = FOLD;
    player.isFold = true;

    this.state.currentTurn = player.turn;
    this.state.remainingPlayer--;
    this.remainingTurn--;

    console.log('FOLD, turn con', this.remainingTurn);

    this.sendNewState(); // send state before fold

    this.foldArr.push(player.turn);

    const mergeArr = [...this.remainingPlayerArr, ...this.allinArr, ...this.foldArr];
    const remainTurn = getNonDupItem(mergeArr);

    let result: any[] = [];
    const betP: any[] = [];
    this.state.players.forEach((p: Player, sessionId: string) => {
      if (p.connected && p.statement === EStatement.Playing && !p.isFold)
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
            this.state.bankerCards = this.banker5Cards;
            return this.endGame(result);
          }
        }
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

    this.actionFoldPlayer();
  }

  private pickWinner1() {
    // hand solver
    const handArr: any[] = [];
    // pick winner and calculate
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
          handArr.push({
            sessionId,
            combinedCards: [...this.banker5Cards].concat([...this.player2Cards[player.turn]]),
          });
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

    let allHands = pokerSolverHand(handArr);
    console.log('pick winner trong nay', calculateResultArr);

    // handle winner tại đây và show kết quả
    const winHand = Hand.winners(winCardsArr)[0];

    // check 1 winner or > 1 winner
    const drawArr = checkDraw(allHands, winHand); // ["45345345","dfer4536345","ergertg34534"]

    // biến kết quả
    let finalCalculateResult: any[] = [];

    /*
     * Draw case
     */
    if (drawArr && drawArr.length > 1) {
      // số người hoà = số ng đang bet
      if (drawArr.length === calculateResultArr.length) {
        for (const emitResult of emitResultArr) {
          emitResult.w = true;
          delete emitResult.i;
        }
        finalCalculateResult = calculateResultArr;
        return { emitResultArr, finalCalculateResult };
      }
      // số ng hoà < số ng đang bet -> có kẻ thua
      const emitDrawResult: any[] = [];
      for (const drawer of drawArr) {
        // emit
        const e = _.find(emitResultArr, { i: drawer });
        e.w = true;

        // result
        const f = _.find(calculateResultArr, { i: drawer });
        f.w = true;
      }

      finalCalculateResult = calculateDraw(calculateResultArr);
      return { emitResultArr, finalCalculateResult };
    }

    /*
     * in case unique winner
     */
    // const winPlayer = <Player>this.state.players.get(winHand.sessionId);
    for (const emitResult of emitResultArr) {
      if (winHand.sessionId === emitResult.i) emitResult.w = true;
      delete emitResult.i;
    }
    for (const calculateResult of calculateResultArr) {
      if (winHand.sessionId === calculateResult.i) calculateResult.w = true;
    }
    // tính toán tiền còn lại mỗi đứa
    finalCalculateResult = calculateAllinPlayer(calculateResultArr);
    console.log('ong pha', finalCalculateResult);
    return { emitResultArr, finalCalculateResult };
  }

  private emitResult(result: any[]) {
    this.broadcast(RESULT, result);
  }

  private endGame(result: any[]) {
    console.log('end game', result);
    this.emitResult(result);
    this.state.round = ERound.SHOWDOWN;
    this.state.players.forEach((player: Player, _: string) => {
      if (player.role === ERole.Player) {
        this.presence.publish(
          'poker:update:balance',
          JSON.stringify({ id: player.id, chips: player.chips }),
        );
      }
    });
    this.sendNewState();
  }

  private actionFoldPlayer() {
    const playingTurnArr = [];
    for (const p of this.state.players.values())
      p.statement === EStatement.Playing && playingTurnArr.push(p.turn);

    const sortedTurn = sortedArr(playingTurnArr);
    const currentTurn = this.state.currentTurn;

    let nextTurn: number;
    if (currentTurn === Math.max(...sortedTurn)) nextTurn = sortedTurn[0];
    else nextTurn = currentTurn + 1;

    for (const fP of this.state.players.values()) {
      if (!fP.connected && fP.turn === nextTurn) this.foldAction(fP);
    }
  }

  private async addBot() {
    if (this.clients.length === this.maxClients) return;
    const bot = new BotClient(
      process.env.NODE_ENV === 'production' ? `${process.env.WS_SERVER}` : 'ws://localhost:9000',
    );
    await bot.joinRoom(this.roomId, this.roomName);
    this.bot?.set(bot.sessionId, bot);
  }

  private sendNewState() {
    this.clients.forEach((client: Client, index: number) => {
      client.send(ALL, this.state);
    });
  }

  private sleep(s: number) {
    return new Promise(resolve => setTimeout(resolve, s * 1000));
  }

  private friendCheck(client: Client, toId: string) {
    let acceptUser: any;
    this.state.players.forEach((player: Player, sessionId: string) => {
      if (player.id === toId) acceptUser = { sessionId, id: player.id };
    });

    const reqUser = <Player>this.state.players.get(client.sessionId);
    if (!reqUser || !acceptUser) return;

    return { reqUser, acceptUser };
  }
}
