import { Client, Room } from 'colyseus.js';
import { ERound, RoomState } from './schemas/room.schema';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, RANK, RESET_CD, RESULT } from './constants/server-emit.constant';
import { EStatement, Player } from './schemas/player.schema';
import { sleep } from '../utils/sleep';
import { sortedArr } from './modules/handlePlayer';

type TCurrentBetInfo = {
  action: string | undefined;
  chips: number;
  betEachAction: number;
};

export class BotClient {
  private readonly client: Client;
  sessionId: string;
  private room: Room<RoomState>;

  private readonly MIN_RANGE = 200;
  private readonly MAX_RANGE = 800;

  private isEndGame: boolean;
  private turnArr = [];

  // all variables of BOT
  private isActive: boolean;
  private isGoFirst: boolean = false;
  private botState: Player;
  private cards = [];
  private currentBetInfo: TCurrentBetInfo;

  constructor(server: string | Client) {
    this.client = server instanceof Client ? server : new Client(server);
  }

  async joinRoom(roomId: string) {
    this.room = await this.client.joinById<RoomState>(roomId, { isBot: true }, RoomState);
    this.sessionId = this.room.sessionId;
    this.begin();
  }

  private begin() {
    // HANDLE STATECHANGE
    this.room.onStateChange(async state => {
      if (!state.onReady) return;
      this.botState = <Player>state.players.get(this.sessionId);
      console.log('current turn', state.currentTurn);
      // xac dinh ai vua di va turn nao
      let remainingPlayerTurn: number[] = [];
      state.players.forEach((player: Player, _: string) => {
        if (player.statement === EStatement.Playing) {
          if (!player.isFold)
            remainingPlayerTurn = sortedArr([...remainingPlayerTurn, player.turn]);
          if (state.currentTurn === player.turn)
            this.currentBetInfo = {
              action: player.action,
              chips: player.chips,
              betEachAction: player.betEachAction,
            };
        }
      });

      // Check specific round
      if (state.round === ERound.WELCOME) this.isEndGame = false;
      if (state.round === ERound.SHOWDOWN) this.isEndGame = true;
      if (this.isEndGame) return;
      this.botReadyToAction(state.currentTurn as number, remainingPlayerTurn);
      return this.betAlgorithm(state.round, this.botState);
    });

    // HANDLE ALL BROADCAST DATA
    this.room.onMessage(DEAL, data => {
      console.log('chia bai', data);
      this.cards = data.c;
      this.isEndGame = false;
    });
    this.room.onMessage(RANK, data => {
      console.log('rank sau moi round', data);
    });
    this.room.onMessage(RESULT, data => {
      console.log('ket qua', data);
      this.isEndGame = true;
    });
    this.room.onMessage(RESET_CD, count => {
      console.log('game is ready after', count);
    });
  }

  // emit action to server
  private emit(action: string, data?: any) {
    this.room.send(action, data);
  }

  async leave() {
    await this.room.leave(true);
  }

  async dispose() {
    // clean up here
    console.log('bot se bi dispose', this.room);
  }

  // DÙNG CHẠY LOAD TEST
  attachToRoom(room: Room) {
    this.room = room;
    this.begin();
  }

  // check bot goes first
  private botReadyToAction(currentTurn: number, sortedRemainingPlayerTurn: number[]) {
    if (currentTurn === -1) return;
    if (this.isEndGame) return (this.isActive = false);
    let a = [];
    if (this.currentBetInfo?.action === FOLD)
      a = sortedArr([currentTurn, ...sortedRemainingPlayerTurn]);
    else a = sortedArr([...new Set([currentTurn, ...sortedRemainingPlayerTurn])]);

    // bot action if previous player action
    if (a[a.length - 2] === currentTurn) {
      console.log(this.currentBetInfo);
      if (!this.currentBetInfo.action) this.isGoFirst = true; // at turn preflop
      if (this.currentBetInfo.action === RAISE || this.currentBetInfo.action === ALLIN)
        this.isGoFirst = false;
      console.log(sortedRemainingPlayerTurn, 'con lai');

      this.isActive = true;
    } else this.isActive = false;
  }

  // Bet Algorithm
  private async betAlgorithm(round: ERound, botState: Player) {
    if (this.isEndGame) return;
    if (!this.isActive) return;
    /* */
    console.log({ endgame: this.isEndGame, active: this.isActive, goFirst: this.isGoFirst });
    await sleep(5);
    this.isActive = false;

    if (this.isGoFirst) {
      if (round === ERound.PREFLOP) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.FLOP) return this.emit(CHECK);
      if (round === ERound.TURN) return this.emit(ALLIN);
      if (round === ERound.RIVER) return this.emit(FOLD);
    } else
      switch (this.currentBetInfo.action) {
        case RAISE:
          console.log('bot raise sau khi co player raise');
          if (this.currentBetInfo.betEachAction > botState.chips) return this.emit(ALLIN);
          return this.emit(CALL);
        case CALL:
          console.log('bot call sau khi player call');
          if (this.currentBetInfo.betEachAction > botState.chips) return this.emit(ALLIN);
          return this.emit(CALL);
        case CHECK:
          console.log('bot check sau khi player check');
          return this.emit(CHECK);
        case ALLIN:
          console.log('bot allin sau khi player allin');
          return this.emit(ALLIN);
        case FOLD:
          console.log('bot check sau khi player fold');
          return this.emit(CHECK);
        default:
          break;
      }
  }

  // random number
  private randomNumberRange() {
    return (
      Math.floor(
        Math.random() * (this.MAX_RANGE / 10 - this.MIN_RANGE / 10 + 1) + this.MIN_RANGE / 10,
      ) * 10
    );
  }
}
