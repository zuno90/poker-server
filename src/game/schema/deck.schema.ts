import { Schema, type } from "@colyseus/schema";
import { createADeck } from "../modules/handleCard";

export class Deck {
  private suits = ["♠", "♣", "♦", "♥"];
  private ranks = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "T",
    "J",
    "Q",
    "K",
    "A",
  ];

  createDeck() {
    return createADeck(this.ranks, this.suits);
  }
}
