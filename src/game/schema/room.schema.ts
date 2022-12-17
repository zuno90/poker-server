import { Schema, MapSchema, type } from "@colyseus/schema";
import { Player } from "./player.schema";

export class RoomState extends Schema {
  @type("boolean")
  onReady: boolean = false;

  @type({ map: Player })
  players = new MapSchema<Player>();

  @type("number")
  highestBet: number = 0;

  @type("number")
  totalBet: number = 0;

  @type(["string"])
  banker5Cards: Array<string>;
}
