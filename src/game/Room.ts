import { Client, Room } from "colyseus";
import { READY } from "./constants/action.constant";
import { ROOM_CHAT, START_GAME } from "./constants/room.constant";
import { RoomState } from "./schema/room.schema";
import { Player } from "./schema/player.schema";
import { deal } from "./modules/handleCard";
import { Card } from "./schema/card.schema";

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;

  onAuth(client: Client, options: any) {
    return JSON.parse(options);
  }

  onCreate(options: any) {
    // CREATE AN INITIAL ROOM STATE
    this.setState(new RoomState());

    // HANDLE ROOM CHAT
    this.handleChat();

    // CHANGE ROOM STATE WHEN ALL USERS GET READY
    this.onMessage(START_GAME, (_, data) => {
      if (this.clients.length < 2) return;
      this.state.onReady = true;
      console.log(this.clients[1].auth);
      const x = deal(this.clients.length);
      console.log("chia bài thử", x);
    });
  }

  onJoin(client: Client, options: any, user: any) {
    // SET INITIAL PLAYER STATE
    this.state.players.set(client.sessionId, new Player(user)); // set player moi lan join

    // CHECK PLAYER INSTANCE
    if (!this.state.players.has(client.sessionId)) return;
    const playerInstance = this.state.players.get(client.sessionId);
    if (!playerInstance) return;
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId + " leave room...");
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  private handleChat() {
    this.onMessage(ROOM_CHAT, (_, data) => {
      this.broadcast(ROOM_CHAT, data);
    });
  }
}
