import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string;
  @type("string") name: string;
  @type("string") username?: string;
  @type("string") email?: string;
  @type("string") avatar: string;
}

export class RoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
