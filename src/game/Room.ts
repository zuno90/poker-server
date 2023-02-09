import { Client, Room } from 'colyseus';
import { Request } from 'express';
import { ERound, RoomState } from './schemas/room.schema';
import { ERole, EStatement, Player } from './schemas/player.schema';
import { ROOM_CHAT, ROOM_DISPOSE, START_GAME } from './constants/room.constant';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, FIRST_TURN, RANK, RESULT } from './constants/server-emit.constant';
import { deal } from './modules/handleCard';
import { updateChip } from '../services/game.service';
import { parseUserFromJwt } from '../utils/jwtChecking';
import { arrangeSeat, arrangeTurn, handleFirstSecond } from './modules/handlePlayer';
import { checkPlayerRank } from './modules/handleRank';
import { BotClient } from './Bot';

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

type TAllinPlayer = {
  sessionId: string;
  allinValue: number;
};

export default class GameRoom extends Room<RoomState> {
  readonly maxClients: number = 5;
  private readonly initBetChip: number = 100;
  private betChip: number = 0;
  private banker5Cards: Array<string> = [];
  private player2Cards: Array<string[]> = [];
  private remainingTurn: number;
  private allinPot: TAllinPlayer[] = [];

  async onAuth(_: Client, options: TJwtAuth, req: Request) {
    // check auth
    const existedPlayer = await parseUserFromJwt(options.jwt);
    // is HOST or second player
    if (!this.state.players.size || this.state.players.size === 1)
      return handleFirstSecond(this.state.players.size, existedPlayer);

    // is not HOST - number of players > 2
    let playerSeatArr: number[] = [];
    this.state.players.forEach((player: Player, _) => playerSeatArr.push(player.seat));
    // find out next seat for this player
    const nextSeat = arrangeSeat(playerSeatArr); // next seat - 1 = 1

    const player = {
      id: existedPlayer.id,
      username: existedPlayer.username ?? existedPlayer.email,
      chips: existedPlayer.chips,
      isHost: false,
      seat: nextSeat,
      role: ERole.Player,
    };
    return player;
  }

  async onCreate(options: TJwtAuth) {
    try {
      // CREATE AN INITIAL ROOM STATE
      this.setState(new RoomState());

      // CHANGE ROOM STATE WHEN ALL USERS GET READY
      this.handleRoomState();

      // HANDLE CHAT ROOM
      this.handleChat();

      // HANDLE ALL ACTION FROM PLAYER
      this.handleAction();
    } catch (err) {
      console.error(err);
    }
  }

  onJoin(client: Client, options: TJwtAuth, player: Player) {
    // SET INITIAL PLAYER STATE
    this.state.players.set(client.sessionId, new Player(player)); // set player every joining
  }

  async onLeave(client: Client, consented: boolean) {
    // update chips before leaving room
    // if (!this.state.players.has(client.sessionId))
    //   throw new Error("Have no any sessionId!");
    // const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    // await updateChip(leavingPlayer.id, leavingPlayer.chips);
    // // flag client as inactive for other users
    // console.log(client.sessionId + " leave room...");

    // leavingPlayer.connected = false;
    // try {
    //   if (consented) throw new Error("consented leave");

    //   // allow disconnected client to reconnect into this room until 20 seconds
    //   await this.allowReconnection(client, 20);

    //   // client returned! let's re-activate it.
    //   leavingPlayer.connected = true;
    // } catch (error) {
    //   // 20 seconds expired. let's remove the client.
    //   this.state.players.delete(client.sessionId);
    // }
    console.log('client ' + client.sessionId + ' has just left');

    const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    if (!leavingPlayer) throw new Error('Have no any player including sessionId!');
    if (leavingPlayer.statement === EStatement.Playing)
      throw new Error('Please wait until end game!');
    // update chip
    this.state.players.delete(client.sessionId);

    // re-arrange turn for player
    if (leavingPlayer.isHost) {
      // handle change host & delete bot
      this.state.players.forEach((player: Player, _) => {
        if (player.turn === 1) {
          player.isHost = true;
          player.turn = 0;
          player.seat = 1;
        }
      });
    }
  }

  async onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
    this.broadcast(ROOM_DISPOSE, 'room bi dispose');
  }

  // HANDLE ALL ACTIONS
  private handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, async (client: Client, _) => {
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
      this.state.remainingPlayer = this.state.players.size;
      this.state.potSize = this.state.players.size * this.initBetChip;

      // initialize state of player

      let playerSeatArr: number[] = [];
      this.state.players.forEach((player: Player, _) => {
        player.statement = EStatement.Playing;
        player.bet = this.initBetChip;
        player.chips -= this.initBetChip;
        playerSeatArr.push(player.seat);
      });
      // gán turn vào
      this.state.players.forEach(
        (player: Player, _) => (player.turn = arrangeTurn(player.seat, playerSeatArr) as number),
      );
      // send to player 2 cards
      this.send2Cards();
      // random đi trước
      return this.broadcast(
        FIRST_TURN,
        Math.round((Math.random() * 10) % (this.state.players.size - 1)),
      );
    });
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
      const player = this.checkBeforeAction(client);
      // check chips
      if (chips < this.betChip / 2) return;
      player.action = RAISE;
      player.bet += chips;
      player.chips -= chips;

      this.betChip = chips;
      this.state.potSize += chips;

      this.remainingTurn = this.state.remainingPlayer - 1;
      console.log('raise:::::', this.remainingTurn);
    });
    // CALL
    this.onMessage(CALL, (client: Client) => {
      const player = this.checkBeforeAction(client);
      player.action = CALL;
      player.bet += this.betChip;
      player.chips -= this.betChip;

      this.state.potSize += this.betChip;
      this.remainingTurn--;
      console.log('call:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.handleEndEachRound(this.state.round);
    });
    // CHECK
    this.onMessage(CHECK, (client: Client) => {
      const player = this.checkBeforeAction(client);
      player.action = CHECK;
      this.remainingTurn--;
      console.log('check:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.handleEndEachRound(this.state.round);
    });
    // ALLIN
    this.onMessage(ALLIN, async (client: Client) => {
      const player = this.checkBeforeAction(client);
      const allinAmount = player.chips;
      player.action = ALLIN;
      player.bet += allinAmount;
      player.chips = 0; // trừ sạch tiền
      this.betChip = allinAmount;

      // đưa tiền vào pot size
      this.allinPot.push({ sessionId: client.sessionId, allinValue: allinAmount });
      // check so luong all in
      console.log(this.allinPot);

      this.remainingTurn = this.state.remainingPlayer - 1;
      this.state.remainingPlayer--;

      console.log('allin:::::', this.remainingTurn);
      if (this.remainingTurn === 0) {
        // check ket qua khi thang cuoi cung all in
        console.log('tính tiền luôn, thằng cuối nó allin rồi');
        this.pickWinner();
        await this.calculateChips();
        this.resetGame();
        return;
      }
    });
    // FOLD
    this.onMessage(FOLD, (client: Client, _) => {
      const player = this.checkBeforeAction(client);
      player.action = FOLD;
      player.isFold = true;
      if (this.state.players.size === 2) {
        // check ket qua khi chi co 2 players
        console.log('tính tiền luôn, còn có thằng kia ah');
        this.state.players.forEach((player: Player, _) => {
          if (!player.isFold) {
            player.chips += this.state.potSize;
            return this.broadcast(RESULT, player.turn);
          }
        });
        console.log('fold:::::chay xuong nay');
        return;
      }
      this.state.remainingPlayer--;
      this.remainingTurn--;
      console.log('fold:::::', this.remainingTurn);
      if (this.remainingTurn === 0) return this.handleEndEachRound(this.state.round);
    });
  }

  // internal function
  private send2Cards() {
    this.clients.forEach((client: Client, _) => {
      const player = <Player>this.state.players.get(client.sessionId);
      client.send(DEAL, this.player2Cards[player.turn]);
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
      this.pickWinner();
      await this.calculateChips();
      this.resetGame();
      return;
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

    this.remainingTurn = this.state.remainingPlayer;
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

  private pickWinner() {
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
        resultArr.push({ s: player.seat, d: rankInfo[0].name, i: rankInfo[0].sessionId });
      }
    });

    // handle winner tại đây và show kết quả
    const winHand = Hand.winners(winCardsArr)[0];
    for (const result of resultArr) {
      if (winHand.sessionId === result.i) result.is_win = true;
      delete result.i;
    }
    // bắn kết quả về cho all clients
    return this.broadcast(RESULT, resultArr);
  }

  private async calculateChips() {
    for (const player of this.state.players.values()) {
      if (player.role === 'Player') await updateChip(player.id, player.chips);
    }
  }

  private resetGame() {
    // global variables
    this.banker5Cards = [];
    this.player2Cards = [];
    this.allinPot = [];
    // room state
    this.state.onReady = false;
    this.state.round = ERound.WELCOME;
    this.state.potSize = 0;
    this.state.bankerCards = [];
    // player state
    this.state.players.forEach((player: Player, sessionId: string) => {
      const newPlayer = {
        id: player.id,
        username: player.username,
        isHost: player.isHost,
        chips: player.chips,
        bet: 0,
        turn: player.turn,
        seat: player.seat,
        role: player.role,
      };
      this.state.players.set(sessionId, new Player(newPlayer));
    });
  }

  private async addBot() {
    const bot = new BotClient(
      process.env.NODE_ENV === 'production' ? `${process.env.WS_SERVER}` : 'ws://localhost:9000',
    );
    console.log(this.roomId);
    await bot.joinRoom(this.roomId);
    console.log(bot.sessionId);
  }
}
