import { Client, Room } from 'colyseus.js';
import { ALLIN, CALL, CHECK, FOLD, RAISE } from '../game/constants/action.constant';
import { ERole, EStatement, Player } from '../game/schemas/player.schema';
import Config from '../game/config';
import { RANK, RESULT } from '../game/constants/server-emit.constant';
import { ALL, FRIEND_REQUEST, START_GAME } from '../game/constants/room.constant';
import { removePlayer, sortedArr } from '../game/modules/handlePlayer';
import { ERound } from '../game/schemas/room.schema';
import { BotClient } from '../game/BotGPT';

type TCurrentBetInfo = {
  turn: number;
  action: string | undefined;
  chips: number;
  betEachAction: number;
};

const config = new Config().pickBot('test');
const MIN_BET = config!.minBet;
const MAX_BET = config!.maxBet;
let isEndGame: boolean = false;
let isActive: boolean = false;
let isGoFirst: boolean = false;
let botState: Player;
let cards = [];
let currentBetInfo: TCurrentBetInfo;
let seat = 0;

const bot = new BotClient(
  process.env.NODE_ENV === 'production' ? `${process.env.WS_SERVER}` : 'ws://localhost:9000',
);

export function requestJoinOptions(this: Client, i: number) {
  const newSeat = seat;
  seat++;
  const player = {
    id: `test-${i}`,
    username: `test-${i}`,
    chips: 400000,
    isHost: newSeat === 0 ? true : false,
    seat: newSeat + 1,
    turn: newSeat === 0 ? 0 : newSeat,
    role: ERole.Player,
  };
  console.log('seat', seat);
  if (seat === 3) seat = 0;
  return player;
}

export async function onJoin(this: Room) {
  console.log(this.sessionId, 'joined room ' + this.id);

  await this.send(START_GAME);

  this.onMessage(RANK, data => {
    console.log('rank sau moi round from broadcast', data);
    if (data.c) cards = data.c; // send 2 cards when game has just been started
  });
  this.onMessage(RESULT, data => {
    console.log('ket qua from broadcast', data);
    isEndGame = true;
  });
  this.onMessage(FRIEND_REQUEST, data => {
    console.log('lời mời kết bạn', data);
  });
  this.onMessage(ALL, state => {
    if (!state.onReady) return;
    const playerArr: Player[] = Object.values(state.players);
    for (const player of playerArr) {
      if (player.role === ERole.Bot) botState = player;
    }
    // xac dinh ai vua di va turn nao
    let remainingPlayerTurn: number[] = [];
    for (const player of playerArr) {
      if (player.statement === EStatement.Playing) {
        if (!player.isFold && player.chips > 0)
          remainingPlayerTurn = sortedArr([...remainingPlayerTurn, player.turn]);
        if (state.currentTurn === player.turn)
          currentBetInfo = {
            turn: player.turn,
            action: player.action,
            chips: player.chips,
            betEachAction: player.betEachAction,
          };
      }
    }
    if (state.round === ERound.WELCOME) {
      isEndGame = true;
      isActive = false;
      isGoFirst = false;
      return;
    } // before starting game - after reset game
    if (state.round === ERound.PREFLOP) isEndGame = false;
    if (state.round === ERound.SHOWDOWN) {
      isEndGame = true;
      isActive = false;
      isGoFirst = false;
      return;
    } // reset BOT
    if (!isActive) return;
    if (state.currentTurn === -1) return;
    if (botState.statement !== EStatement.Playing) return;
    let rIFPlayer = [];
    if (currentBetInfo.action === ALLIN || currentBetInfo.action === FOLD) {
      rIFPlayer = removePlayer(currentBetInfo.turn, remainingPlayerTurn);
    } else {
      rIFPlayer = sortedArr([...new Set([...remainingPlayerTurn])]);
    }
    // check bot is fold or allin
    const isHasBotTurn = rIFPlayer.find(turn => turn > currentBetInfo.turn);
    console.log('turn bot', isHasBotTurn);
    if (isHasBotTurn !== botState.turn) {
      isActive = false;
      return;
    }
    isActive = true;
    if (!currentBetInfo.action) isGoFirst = true; // at turn preflop
    if (
      currentBetInfo.action === RAISE ||
      currentBetInfo.action === ALLIN ||
      currentBetInfo.betEachAction > botState.betEachAction
    )
      isGoFirst = false;
    if (isEndGame) return;
    setTimeout(
      () => {
        // case go 1st -> true
        if (isGoFirst) {
          if (state.round === ERound.PREFLOP)
            return this.send(RAISE, { chips: randomNumberRange() });
          if (state.round === ERound.FLOP) return this.send(RAISE, { chips: randomNumberRange() });
          if (state.round === ERound.TURN) return this.send(RAISE, { chips: randomNumberRange() });
          if (state.round === ERound.RIVER) return this.send(RAISE, { chips: randomNumberRange() });
        }
        // case go 1st -> false
        if (currentBetInfo.action === RAISE) {
          console.log('bot call/allin sau khi co player call/allin');
          if (currentBetInfo.betEachAction > botState.chips) return this.send(ALLIN);
          return this.send(CALL);
        }
        if (currentBetInfo.action === CALL) {
          console.log('bot call/allin sau khi player call/allin');
          if (currentBetInfo.betEachAction > botState.chips) return this.send(ALLIN);
          return this.send(CALL);
        }
        if (currentBetInfo.action === CHECK) {
          console.log('bot check sau khi player check');
          return this.send(CHECK);
        }
        if (currentBetInfo.action === ALLIN) {
          console.log('bot allin sau khi player allin');
          return this.send(ALLIN);
        }
        if (currentBetInfo.action === FOLD) {
          console.log('bot check sau khi player fold');
          return this.send(CHECK);
        }
      },

      5000,
    );
  });
}

export function onLeave(this: Room) {
  console.log(this.sessionId, 'left.');
}

export function onError(this: Room, err: any) {
  console.error(this.sessionId, '!! ERROR !!', err.message);
}

export function onStateChange(this: Room, state: any) {}

// random number
function randomNumberRange() {
  return Math.floor(Math.random() * (MAX_BET / 10 - MIN_BET / 10 + 1) + MIN_BET / 10) * 10;
}

async function leave(this: Room) {
  await this.leave(true);
}
