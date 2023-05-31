import * as Colyseus from 'colyseus.js';
import { ERound, RoomState } from './schemas/room.schema';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from './constants/action.constant';
import { RANK, RESULT } from './constants/server-emit.constant';
import { ERole, EStatement, Player } from './schemas/player.schema';
import { removePlayer, sortedArr } from './modules/handlePlayer';
import { ALL, FRIEND_REQUEST, KICK_PLAYER } from './constants/room.constant';
import Config from './config';
import { type } from 'os';

type TCurrentBetInfo = {
  turn: number;
  action: string | undefined;
  chips: number;
  betEachAction: number;
  accumulatedBet: number;
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
    this.room.onMessage(RAISE, () => {});
    this.room.onMessage(CALL, () => {});
    this.room.onMessage(CHECK, () => {});
    this.room.onMessage(FOLD, () => {});
    this.room.onMessage(ALLIN, () => {});

    this.room.onMessage('GET_HISTORY', () => {});
    this.room.onMessage('RESET_GAME', () => {});

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

    this.room.onMessage(KICK_PLAYER, state => {
      if (state) return this.leave();
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
              accumulatedBet: player.accumulatedBet,
            };
        }
      }
      // check round
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
        this.isActive = false;
      }

      return setTimeout(
        () => this.botReadyToAction(state, this.botState, remainingPlayerTurn),
        500,
      );
    });
  }

  // check bot goes first
  private async botReadyToAction(state: any, bot: Player, sortedRemainingPlayerTurn: number[]) {
    if (state.currentTurn === -1) return;
    if (bot.statement !== EStatement.Playing) return;

    let rIFPlayer = [];
    if (this.currentBetInfo.action === ALLIN || this.currentBetInfo.action === FOLD) {
      rIFPlayer = removePlayer(this.currentBetInfo.turn, sortedRemainingPlayerTurn);
    } else {
      rIFPlayer = sortedArr([...new Set([...sortedRemainingPlayerTurn])]); // [0,1,2] => 5
    }

    // check bot has turn
    const botTurn = rIFPlayer.find(turn => turn > this.currentBetInfo.turn);
    if (botTurn && botTurn === bot.turn) {
      this.isActive = true;
      if (this.isEndGame) this.isActive = false;
    }

    if (!this.currentBetInfo.action && botTurn === bot.turn) {
      this.isGoFirst = true;
    } else if (this.currentBetInfo.betEachAction > bot.betEachAction) {
      this.isGoFirst = false;
    }

    console.log({ end: this.isEndGame, active: this.isActive, go1st: this.isGoFirst });
    if (state.round === ERound.WELCOME || state.round === ERound.SHOWDOWN) return;

    if (this.isEndGame || !this.isActive) return;
    // case go 1st -> true
    if (this.isGoFirst) {
      await this.sleep(8);
      if (state.round === ERound.PREFLOP)
        return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (state.round === ERound.FLOP) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (state.round === ERound.TURN) return this.emit(RAISE, { chips: this.randomNumberRange() });
      if (state.round === ERound.RIVER)
        return this.emit(RAISE, { chips: this.randomNumberRange() });
    } else {
      await this.sleep(5);
      // case go 1st -> false
      if (this.currentBetInfo.action === RAISE) {
        console.log('bot call/allin sau khi co player call/allin');
        if (this.currentBetInfo.betEachAction >= bot.chips) return this.emit(ALLIN);
        return this.emit(CALL);
      } else if (this.currentBetInfo.action === CALL) {
        console.log('bot call/allin sau khi player call/allin');
        if (this.currentBetInfo.accumulatedBet === bot.accumulatedBet) return this.emit(CHECK);
        if (this.currentBetInfo.betEachAction >= bot.chips) return this.emit(ALLIN);
        return this.emit(CALL);
      } else if (this.currentBetInfo.action === CHECK) {
        console.log('bot check sau khi player check');
        return this.emit(CHECK);
      } else if (this.currentBetInfo.action === ALLIN) {
        console.log('bot allin sau khi player allin');
        return this.emit(ALLIN);
      } else if (this.currentBetInfo.action === FOLD) {
        console.log('bot fold sau khi player fold');
        return this.emit(FOLD);
      } else return;
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
