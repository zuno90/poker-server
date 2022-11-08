import { Client, Room } from "colyseus";
import { RoomState } from "./schema/room.schema";
import { Player } from "./schema/player.schema";
import { Card } from "./schema/card.schema";
import { READY } from "./constants/action.constant";
import { ROOM_CHAT, ROOM_DISPOSE, START_GAME } from "./constants/room.constant";
import { deal } from "./modules/handleCard";

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;

  onAuth(client: Client, player: Player) {
    return player;
  }

  onCreate(options: any) {
    // CREATE AN INITIAL ROOM STATE
    this.setState(new RoomState());

    // HANDLE ROOM CHAT
    this.handleChat();

    // CHANGE ROOM STATE WHEN ALL USERS GET READY
    this.handlePlayerState();
  }

  onJoin(client: Client, options: any, player: Player) {
    // SET INITIAL PLAYER STATE
    this.state.players.set(client.sessionId, new Player(player)); // set player moi lan join
  }

  async onLeave(client: Client, consented: boolean) {
    // flag client as inactive for other users
    console.log(client.sessionId + " leave room...");
    if (!this.state.players.has(client.sessionId)) return;
    const playerInstance = this.state.players.get(client.sessionId);
    if (!playerInstance) return;
    playerInstance.connected = false;
    try {
      if (consented) throw new Error("consented leave");

      // allow disconnected client to reconnect into this room until 20 seconds
      await this.allowReconnection(client, 20);

      // client returned! let's re-activate it.
      playerInstance.connected = true;
    } catch (error) {
      // 20 seconds expired. let's remove the client.
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log("room", this.roomId, "disposing...");
    await this.broadcast(ROOM_DISPOSE, "room bi dispose");
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
