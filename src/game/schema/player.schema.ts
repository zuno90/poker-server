import { Schema, ArraySchema, type } from "@colyseus/schema";
import { Card } from "./card.schema";

enum PlayerState {
  NOTREADY = "NOTREADY",
  READY = "READY",
  CALL = "CALL",
  CHECK = "CHECK",
  RAISE = "RAISE",
  ALLIN = "ALLIN",
  FOLD = "FOLD",
}

export class Player extends Schema {
  @type("string")
  id: string;

  @type("string")
  state: string = PlayerState.NOTREADY;

  @type([Card])
  cards = new ArraySchema<Card>();
}
