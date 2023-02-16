import { Client, Room } from 'colyseus.js';
import { ERound, RoomState } from './schemas/room.schema';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { DEAL, RANK, RESULT } from './constants/server-emit.constant';
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

  // all variables of BOT
  private isActive: boolean = false;
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

  private begin() {
    // HANDLE STATECHANGE
    this.room.onStateChange(async state => {
      if (!state.onReady) return;
      this.botState = <Player>state.players.get(this.sessionId);
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
      if (state.round === ERound.SHOWDOWN) {
        this.isEndGame = true;
        this.isActive = false;
        this.isGoFirst = false;
        return;
      } // reset BOT
      console.log('end game', this.isEndGame);
      if (this.isEndGame) return;
      this.botReadyToAction(state.currentTurn as number, remainingPlayerTurn); // active/deactive bot
      if (!this.isActive) return;
      return this.betAlgorithm(state.round, this.botState); // run algorithm of bot
    });

    // HANDLE ALL BROADCAST DATA
    this.room.onMessage(DEAL, data => {
      console.log('chia bai from broadcast', data);
      this.cards = data.c;
      this.isEndGame = false;
    });
    this.room.onMessage(RANK, data => {
      console.log('rank sau moi round from broadcast', data);
    });
    this.room.onMessage(RESULT, data => {
      console.log('ket qua from broadcast', data);
      this.isEndGame = true;
    });
  }

  // check bot goes first
  private botReadyToAction(currentTurn: number, sortedRemainingPlayerTurn: number[]) {
    if (currentTurn === -1) return;
    if (sortedRemainingPlayerTurn.length === 1) {
      this.isEndGame = true;
      this.isActive = false;
      return;
    } // case fold con 1

    let rIFPlayer = [];
    if (this.currentBetInfo?.action === FOLD || this.currentBetInfo?.action === ALLIN)
      rIFPlayer = sortedArr([currentTurn, ...sortedRemainingPlayerTurn]);
    else rIFPlayer = sortedArr([...new Set([currentTurn, ...sortedRemainingPlayerTurn])]);

    // bot action if previous player action
    if (rIFPlayer[rIFPlayer.length - 2] === currentTurn) {
      // check game end?
      console.log(this.currentBetInfo);
      if (!this.currentBetInfo.action) this.isGoFirst = true; // at turn preflop
      if (this.currentBetInfo.action === RAISE || this.currentBetInfo.action === ALLIN)
        this.isGoFirst = false;

      this.isActive = true;
    } else this.isActive = false;
    console.log({ endgame: this.isEndGame, active: this.isActive, goFirst: this.isGoFirst });
  }

  // Bet Algorithm
  private async betAlgorithm(round: ERound, botState: Player) {
    await sleep(3);
    // case go 1st -> true
    if (this.isGoFirst) {
      if (round === ERound.PREFLOP) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (round === ERound.FLOP) return this.emit(CHECK);
      if (round === ERound.TURN) return this.emit(ALLIN);
      if (round === ERound.RIVER) return this.emit(FOLD);
    }
    // case go 1st -> false
    if (this.currentBetInfo.action === RAISE) {
      console.log('bot raise/allin sau khi co player raise/allin');
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
      console.log('bot check sau khi player fold');
      return this.emit(CHECK);
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
