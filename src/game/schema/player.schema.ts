import { Schema, type } from "@colyseus/schema";

enum PlayerState {
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
  turn: number;

  @type("string")
  state: PlayerState | undefined;

  @type(["string"])
  cards: Array<string>;

  @type("boolean")
  connected: boolean = true;
}
