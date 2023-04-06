import * as Colyseus from 'colyseus.js';
import { ERound, RoomState } from './schemas/room.schema';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { RANK, RESULT } from './constants/server-emit.constant';
import { ERole, EStatement, Player } from './schemas/player.schema';
import { removePlayer, sortedArr } from './modules/handlePlayer';
import { ALL, FRIEND_REQUEST, RESET_GAME, ROOM_CHAT } from './constants/room.constant';
import Config from './config';

type TCurrentBetInfo = {
  turn: number;
  action: string | undefined;
  chips: number;
  betEachAction: number;
};

export class BotClient {
  private readonly config: Config = new Config();

  private readonly client: Colyseus.Client;
  public sessionId: string;
  private room: Colyseus.Room<RoomState>;

  private MIN_BET: number;
  private MAX_BET: number;

  // all variables of BOT
  private isEndGame: boolean = false;
  private isActive: boolean = false;
  private isGoFirst: boolean = false;
  private botState: Player;
  private cards = [];
  private currentBetInfo: TCurrentBetInfo;

  constructor(server: string | Colyseus.Client) {
    this.client = server instanceof Colyseus.Client ? server : new Colyseus.Client(server);
  }

  public async joinRoom(roomId: string, level: string) {
    this.room = await this.client.joinById<RoomState>(roomId, { isBot: true }, RoomState);
    this.sessionId = this.room.sessionId;

    const botConfig = this.config.pickBot(level);
    this.MIN_BET = botConfig!.minBet;
    this.MAX_BET = botConfig!.maxBet;

    this.listenEvents();
  }

  // emit action to server
  private emit(action: string, data?: any) {
    this.room.send(action, data);
  }

  public async leave() {
    await this.room.leave(true);
  }

  public async dispose() {
    // clean up here
    console.log('bot se bi dispose', this.room);
  }

  // DÙNG CHẠY LOAD TESTS
  public attachToRoom(room: Colyseus.Room) {
    this.room = room;
    this.sessionId = this.room.sessionId;
    const botConfig = this.config.pickBot('draw');
    this.MIN_BET = botConfig!.minBet;
    this.MAX_BET = botConfig!.maxBet;
    this.listenEvents();
  }

  private listenEvents() {
    // HANDLE ALL BROADCAST DATA
    this.room.onMessage(RANK, data => {
      console.log('rank sau moi round from broadcast', data);
      if (data.c) this.cards = data.c; // send 2 cards when game has just been started
    });
    this.room.onMessage(RESULT, data => {
      console.log('ket qua from broadcast', data);
    });

    this.room.onMessage(FRIEND_REQUEST, data => {
      console.log('lời mời kết bạn', data);
    });

    this.room.onMessage(ALL, state => {
      if (!state.onReady) return;
      const playerArr: Player[] = Object.values(state.players);
      for (const player of playerArr) {
        if (player.role === ERole.Bot) this.botState = player;
      }

      // xac dinh ai vua di va turn nao
      let remainingPlayerTurn: number[] = [];
      for (const player of playerArr) {
        if (player.statement === EStatement.Playing) {
          if (!player.isFold && player.chips > 0)
            remainingPlayerTurn = sortedArr([...remainingPlayerTurn, player.turn]);
          if (state.currentTurn === player.turn)
            this.currentBetInfo = {
              turn: player.turn,
              action: player.action,
              chips: player.chips,
              betEachAction: player.betEachAction,
            };
        }
      }

      this.botReadyToAction(state, this.botState, remainingPlayerTurn); // active/deactive bot
      return this.betAlgorithm(state.round, this.botState); // run algorithm of bot
    });
  }

  // check bot goes first
  private botReadyToAction(state: any, bot: Player, sortedRemainingPlayerTurn: number[]) {
    if (state.currentTurn === -1) return;
    if (bot.statement !== EStatement.Playing) return;

    let rIFPlayer = [];
    if (this.currentBetInfo.action === ALLIN || this.currentBetInfo.action === FOLD) {
      rIFPlayer = removePlayer(this.currentBetInfo.turn, sortedRemainingPlayerTurn);
    } else {
      rIFPlayer = sortedArr([...new Set([...sortedRemainingPlayerTurn])]);
    }

    if (!this.currentBetInfo.action) {
      this.isGoFirst = true;
    } // at turn preflop
    if (
      this.currentBetInfo.action === RAISE ||
      this.currentBetInfo.action === ALLIN ||
      this.currentBetInfo.betEachAction > bot.betEachAction
    ) {
      this.isGoFirst = false;
    }

    // check bot is fold or allin
    const isHasBotTurn = rIFPlayer.find(turn => turn > this.currentBetInfo.turn);
    console.log('turn bot', isHasBotTurn);
    if (isHasBotTurn !== bot.turn) {
      this.isActive = false;
    } else {
      if (state.round === ERound.WELCOME || state.round === ERound.SHOWDOWN) {
        this.isEndGame = true;
        this.isActive = false;
        this.isGoFirst = false;
        return;
      } // before starting game - after reset game
      if (
        state.round === ERound.PREFLOP ||
        state.round === ERound.FLOP ||
        state.round === ERound.TURN ||
        state.round === ERound.RIVER
      ) {
        this.isEndGame = false;
        this.isActive = true;
      }
    }
  }

  // Bet Algorithm
  private async betAlgorithm(round: ERound, botState: Player) {
    console.log({ end: this.isEndGame, active: this.isActive, go1st: this.isGoFirst });
    if (!this.isActive || this.isEndGame) return;
    await this.sleep(5);
    // case go 1st -> true
    console.log('bot actionnnnnn');
    if (this.isGoFirst) {
      await this.sleep(3);
      if (round === ERound.PREFLOP) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.FLOP) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.TURN) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.RIVER) return this.emit(RAISE, { chips: this.randomNumberRange() });
    } else {
      // case go 1st -> false
      if (this.currentBetInfo.action === RAISE) {
        console.log('bot call/allin sau khi co player call/allin');
        if (this.currentBetInfo.betEachAction > botState.chips) return this.emit(ALLIN);
        return this.emit(CALL);
      }
      if (this.currentBetInfo.action === CALL) {
        console.log('bot call/allin sau khi player call/allin');
        if (this.currentBetInfo.betEachAction > botState.chips) return this.emit(ALLIN);
        return this.emit(CALL);
      }
      if (this.currentBetInfo.action === CHECK) {
        console.log('bot check sau khi player check');
        return this.emit(CHECK);
      }
      if (this.currentBetInfo.action === ALLIN) {
        console.log('bot allin sau khi player allin');
        return this.emit(ALLIN);
      }
      if (this.currentBetInfo.action === FOLD) {
        console.log('bot fold sau khi player fold');
        return this.emit(FOLD);
      }
    }
  }

  // random number
  private randomNumberRange() {
    return (
      Math.floor(Math.random() * (this.MAX_BET / 10 - this.MIN_BET / 10 + 1) + this.MIN_BET / 10) *
      10
    );
  }

  private sleep(s: number) {
    return new Promise(resolve => setTimeout(resolve, s * 1000));
  }
}
