import { MapSchema, Schema, type } from '@colyseus/schema';
import { Player } from './player.schema';

export enum ERound {
  PREFLOP = 'PREFLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
}

export class RoomState extends Schema {
  @type('boolean')
  onReady: boolean = false;

  @type({ map: Player })
  players = new MapSchema<Player>();

  @type('string')
  round: ERound = ERound.PREFLOP;

  @type(['string'])
  bankerCards: string[] = [];

  @type('number')
  potSize: number = 0;

  @type('number')
  remainingPlayer: number;
}
