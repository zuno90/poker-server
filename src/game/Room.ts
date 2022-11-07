import { Client, Room } from "colyseus";
import { READY } from "./constants/action.constant";
import { ROOM_CHAT, ROOM_DISPOSE, START_GAME } from "./constants/room.constant";
import { RoomState } from "./schema/room.schema";
import { Player } from "./schema/player.schema";
import { deal } from "./modules/handleCard";
import { Card } from "./schema/card.schema";

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;

  onAuth(client: Client, user: any) {
    return JSON.parse(user);
  }

  onCreate(options: any) {
    // CREATE AN INITIAL ROOM STATE
    this.setState(new RoomState());

    // HANDLE ROOM CHAT
    this.handleChat();

    // CHANGE ROOM STATE WHEN ALL USERS GET READY
    this.handlePlayerState();
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
    this.broadcast(ROOM_DISPOSE, { data: true });
  }

  // handle function

  private handleChat() {
    this.onMessage(ROOM_CHAT, (_, data) => {
      console.log(data);
      this.broadcast(ROOM_CHAT, data);
    });
  }

  private handlePlayerState() {
    // START GAME
    this.onMessage(START_GAME, (_, data) => {
      if (this.clients.length < 2) return;
      const { onHandCards, banker5Cards } = deal(this.clients.length);
      this.state.onReady = true; // change room state -> TRUE
      this.state.banker5Cards = banker5Cards; // change cards of banker -> [...]
      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        playerMap.cards = onHandCards[playerMap.turn - 1];
      });
    });
  }
}
