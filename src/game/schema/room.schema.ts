import { Schema, MapSchema, type } from "@colyseus/schema";
import { Player } from "./player.schema";

export class RoomState extends Schema {
  @type("boolean")
  onReady: boolean;

  @type({ map: Player })
  players = new MapSchema<Player>();
}
