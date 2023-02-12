import { Client, Room } from 'colyseus.js';
import { ERound, RoomState } from './schemas/room.schema';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, RANK, RESULT } from './constants/server-emit.constant';
import { Player } from './schemas/player.schema';
import { sortedArr } from './modules/handlePlayer';
import { sleep } from '../utils/sleep';

type TCurrentBetInfo = {
  action: string;
  chips: number;
};

export class BotClient {
  private readonly client: Client;
  sessionId: string;
  private room: Room<RoomState>;

  // all variables of ROOM

  // all variables of BOT
  private isActive: boolean = false;
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
        this.currentBetInfo = {
          action: player.action,
          chips: player.chips,
        };
      });

      if (state.round === ERound.PREFLOP) {
        console.log(state.currentTurn, ERound.PREFLOP);
        if (this.botState.turn - 1 === state.currentTurn) {
          await sleep(5);
          this.emit(RAISE, { chips: 500 });
        }
      }
      return this.betAlgorithm(state.currentTurn, remainingPlayerTurn);
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
  private async betAlgorithm(currentTurn: number, remainingPlayerTurn: number[]) {
    // sap xep lai mang
    const sortedRemainingPlayerTurn = sortedArr(remainingPlayerTurn);
    // xac dinh turn de active bot

    if (currentTurn === sortedRemainingPlayerTurn[sortedRemainingPlayerTurn.length - 2])
      this.isActive = true;

    if (this.isActive) {
      if (this.currentBetInfo.action === RAISE) {
        console.log('bot call sau khi co player raise');
        this.isActive = false;
        await sleep(5);
        return this.emit(CALL);
      }
      if (this.currentBetInfo.action === CALL) {
        console.log('bot call sau khi player call');
        this.isActive = false;
        // await sleep(5);
        return this.emit(CALL);
      }
      if (this.currentBetInfo.action === CHECK) {
        console.log('bot check sau khi player check');
        this.isActive = false;
        await sleep(5);
        return this.emit(CHECK);
      }
      if (this.currentBetInfo.action === ALLIN) {
        console.log('bot allin sau khi player allin');
        this.isActive = false;
        await sleep(5);
        return this.emit(FOLD);
      }
      if (this.currentBetInfo.action === FOLD) {
        console.log('bot fold sau khi player fold');
        this.isActive = false;
        await sleep(5);
        return this.emit(FOLD);
      }
    }
  }
}
