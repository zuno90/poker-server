import { Schema, type } from "@colyseus/schema";
import { createADeck } from "../modules/handleCard";

export class Deck extends Schema {
  @type(["string"])
  suits = ["♠︎", "♣︎", "♦︎", "♥︎"];

  @type(["string"])
  ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  createDeck() {
    return createADeck(this.ranks, this.suits);
  }
}
