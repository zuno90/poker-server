import { Schema, type } from '@colyseus/schema';

export enum ERole {
  Player = 'Player',
  Bot = 'Bot',
}

export enum EStatement {
  Playing = 'Playing',
  Waiting = 'Waiting',
}

export enum EPos {
  big = 'big',
  small = 'small',
  none = 'none',
}

export class Player extends Schema {
  @type('string') id: string;

  @type('string') name: string;

  @type('string') avatar: string;

  @type('boolean') isHost: boolean;

  @type('number') chips: number;

  @type('boolean') allowAddFriend: boolean;

  @type('boolean') allowWatchProfile: boolean;

  @type('string') action: string;

  @type('number') betEachAction: number = 0;

  @type('number') accumulatedBet: number = 0;

  @type('string') pos: EPos = EPos.none;

  @type('number') turn: number;

  @type('number') seat: number;

  @type('string') role: ERole;

  @type('string') statement: EStatement = EStatement.Waiting;

  @type('boolean') connected: boolean = true;

  @type('boolean') isFold: boolean = false;

  @type('boolean') bookingLeave: boolean = false;
}
