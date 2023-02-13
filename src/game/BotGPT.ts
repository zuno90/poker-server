import { Client, Room } from 'colyseus.js';
import { ERound, RoomState } from './schemas/room.schema';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, RANK, RESULT } from './constants/server-emit.constant';
import { Player } from './schemas/player.schema';
import { sleep } from '../utils/sleep';

type TCurrentBetInfo = {
  action: string;
  chips: number;
};

export class BotClient {
  private readonly client: Client;
  sessionId: string;
  private room: Room<RoomState>;

  private readonly INIT_RAISING_BET = 500;
  private readonly MIN_RANGE = 500;
  private readonly MAX_RANGE = 1000;

  private isEndGame: boolean;

  // all variables of BOT
  private isActive: boolean;
  private isGoFirst: boolean;
  private botState: Player;
  private cards = [];
  private currentBetInfo: TCurrentBetInfo;

  constructor(server: string | Client) {
    this.client = server instanceof Client ? server : new Client(server);
    console.log(this);
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
      // xac dinh ai vua di va turn nao
      let remainingPlayerTurn: number[] = [];
      state.players.forEach((player: Player, _: string) => {
        if (!player.isFold) remainingPlayerTurn = [...remainingPlayerTurn, player.turn];
        if (state.currentTurn === player.turn)
          this.currentBetInfo = {
            action: player.action,
            chips: player.chips,
          };
      });
      // Check specific round
      if (state.round === ERound.WELCOME) {
        this.isEndGame = false;
      }
      if (state.round === ERound.SHOWDOWN) {
        this.isEndGame = true;
      }
      console.log('end game', this.isEndGame);
      this.botReadyToAction(this.botState.turn, state.currentTurn as number);
      return this.betAlgorithm(state.round);
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
  private botReadyToAction(botTurn: number, currentTurn: number) {
    if (botTurn - currentTurn === 1) {
      // kiem tra ket qua co chua
      if (this.isEndGame) return (this.isActive = false);
      this.isActive = true;
      console.log(this.currentBetInfo);
      if (!this.currentBetInfo.action) this.isGoFirst = true;
      if (this.currentBetInfo.action === RAISE || this.currentBetInfo.action === ALLIN)
        this.isGoFirst = false;
    } else this.isActive = false;
  }

  // Bet Algorithm
  private async betAlgorithm(round: ERound) {
    console.log('is active', this.isActive);
    console.log('bot go 1st', this.isGoFirst);
    if (this.isEndGame) return;
    if (!this.isActive) return;

    await this.botGoFirstByRound(round);
    await this.botGoLastByPrevAction(this.currentBetInfo.action);
  }

  // bot go 1st by round
  private async botGoFirstByRound(round: ERound) {
    if (this.isGoFirst) {
      await sleep(3);
      this.isGoFirst = false;
      if (round === ERound.PREFLOP) return this.emit(RAISE, { chips: this.INIT_RAISING_BET });
      if (round === ERound.FLOP) return this.emit(CHECK);
      if (round === ERound.TURN) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.RIVER) return this.emit(FOLD);
    }
  }

  private async botGoLastByPrevAction(action: string) {
    await sleep(3);
    this.isActive = false;
    switch (action) {
      case RAISE:
        console.log('bot call sau khi co player raise');
        return this.emit(CALL);
      case CALL:
        console.log('bot call sau khi player call');
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
