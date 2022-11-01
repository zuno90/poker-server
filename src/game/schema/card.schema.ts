import { Schema, type } from "@colyseus/schema";

export class Card extends Schema {
  @type("string")
  rank: string;

  @type("string")
  suit: string;
}
