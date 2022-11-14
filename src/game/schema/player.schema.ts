import { Schema, MapSchema, type } from "@colyseus/schema";

export enum EPlayerAction {
  CALL = "CALL",
  CHECK = "CHECK",
  RAISE = "RAISE",
  ALLIN = "ALLIN",
  FOLD = "FOLD",
}

export class Player extends Schema {
  @type("string")
  id: string;

  @type("boolean")
  isHost: boolean;

  @type("number")
  chips: number;

  @type("number")
  betChips: number;

  @type("number")
  turn: number;

  @type("string")
  action: EPlayerAction | undefined;

  @type(["string"])
  cards: Array<string>;

  @type("boolean")
  connected: boolean;

  @type("boolean")
  isWinner: boolean;

  @type("string")
  cardRank: string | undefined;
}
