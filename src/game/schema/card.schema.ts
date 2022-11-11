import { Schema, ArraySchema, type } from "@colyseus/schema";

export enum ERanking {
  ROYAL_FLUSH = "ROYAL_FLUSH", // thùng phá sảnh 10 J Q K A
  STRAIGHT_FLUSH = "STRAIGHT_FLUSH", // thùng phá sảnh nhỏ
  FOUR_OF_A_KIND = "FOUR_OF_A_KIND", // tứ quý
  FULL_HOUSE = "FULL_HOUSE", // cù lũ
  FLUSH = "FLUSH", // thùng
  STRAIGHT = "STRAIGHT", // sảnh
  THREE_OF_A_KIND = "THREE_OF_A_KIND", // xám cô
  TWO_PAIRS = "TWO_PAIRS", // thú
  ONE_PAIR = "ONE_PAIR", // 1 đôi
  HIGH_HAND = "HIGH_HAND", // lẻ
}

export class Card extends Schema {
  suits = ["♠", "♣", "♦", "♥"];
  ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

  @type(["string"])
  player7Cards = new ArraySchema<string>();

  handleRanking() {
    return "pick ra ng chien thang";
  }
}
