import { Schema, MapSchema, type } from "@colyseus/schema";

export enum ERole {
  Player = "Player",
  Bot = "Bot",
}

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
  action: EPlayerAction;

  @type(["string"])
  cards: Array<string>;

  @type("string")
  role: ERole;

  @type("boolean")
  isFold: boolean = false;

  @type("boolean")
  connected: boolean;

  @type("boolean")
  isWinner: boolean;

  @type("string")
  cardRank: string | undefined;
}
