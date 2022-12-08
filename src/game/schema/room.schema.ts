import { Schema, MapSchema, type } from "@colyseus/schema";
import { Player } from "./player.schema";

export class RoomState extends Schema {
  @type("boolean")
  onReady: boolean = false;

  @type({ map: Player })
  players = new MapSchema<Player>();

  @type("number")
  highestBet: number;

  @type("number")
  totalBet: number

  @type(["string"])
  banker5Cards: Array<string>;
}
