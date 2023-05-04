import { ArraySchema, Schema, type } from '@colyseus/schema';

export class HistoryPlayer extends Schema {
  @type('string') id: string;
  @type('string') name: string;
  @type(['string']) cards: string[];
  @type('number') revenue: number;
}

export class PreviousGameState extends Schema {
  @type('string') roomId: string;

  @type(['string']) bankerCards: string[] = [];

  @type([HistoryPlayer]) players = new ArraySchema<HistoryPlayer>();
}
