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

  private isEndGame = false;

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
      if (state.round === ERound.WELCOME) {
        console.log('round', ERound.WELCOME);
      }
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

      this.botReadyToAction(this.botState.turn, state.currentTurn as number);
      return this.betAlgorithm(state.round);
    });

    // HANDLE ALL BROADCAST DATA
    this.room.onMessage(DEAL, data => {
      console.log('chia bai', data);
      this.cards = data.c;
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

  // Bet Algorithm
  private async betAlgorithm(round: ERound) {
    console.log('is active', this.isActive);
    console.log('bot go 1st', this.isGoFirst);
    if (!this.isActive) return;
    if (this.isGoFirst) {
      await sleep(3);
      if (round === ERound.PREFLOP) return this.emit(RAISE, { chips: this.INIT_RAISING_BET });
      if (round === ERound.FLOP) return this.emit(CHECK);
      if (round === ERound.TURN) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.RIVER) return this.emit(FOLD);
    }
    if (this.currentBetInfo.action === RAISE) {
      console.log('bot call sau khi co player raise');
      await sleep(3);
      this.isActive = false;
      return this.emit(CALL);
    }
    if (this.currentBetInfo.action === CALL) {
      console.log('bot call sau khi player call');
      await sleep(3);
      this.isActive = false;
      return this.emit(CALL);
    }
    if (this.currentBetInfo.action === CHECK) {
      console.log('bot check sau khi player check');
      await sleep(3);
      this.isActive = false;
      return this.emit(CHECK);
    }
    if (this.currentBetInfo.action === ALLIN) {
      console.log('bot allin sau khi player allin');
      await sleep(3);
      this.isActive = false;
      return this.emit(ALLIN);
    }
    if (this.currentBetInfo.action === FOLD) {
      console.log('bot check sau khi player check');
      this.isActive = false;
      await sleep(3);
      return this.emit(CHECK);
    }
  }

  // check bot goes first
  private botReadyToAction(botTurn: number, currentTurn: number) {
    if (botTurn - currentTurn === 1) {
      // kiem tra ket qua co chua
      if (this.isEndGame) return (this.isActive = false);
      this.isActive = true;
      console.log(this.currentBetInfo);
      if (!this.currentBetInfo.action) {
        // preflop noone had action
        this.isGoFirst = true;
      } else if (this.currentBetInfo.action === RAISE || this.currentBetInfo.action === ALLIN) {
        this.isGoFirst = false;
      } else this.isGoFirst = true;
    } else this.isActive = false;
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
