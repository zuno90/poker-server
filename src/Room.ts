import { Client, Room } from "colyseus";
import { Player, RoomState } from "./schema/room.state";

interface User {
  id: number;
  email?: string;
  username?: string;
  displayName: string;
}

export default class GameRoom extends Room<RoomState> {
  public maxClients = 5;
  // private bots: Map<string, BotClient> | null = new Map<string, BotClient>();

  // async addBot() {
  //   const bot = new BotClient(SERVER_URL);
  //   await bot.joinRoom(this.roomId);
  //   this.bots.set(bot.sessionId, bot);
  // }

  onAuth(client: Client, options: any) {
    console.log(options);
    const { id, email, displayName } = JSON.parse(options);
    return { id, email, displayName };
  }

  onCreate(options: any) {
    console.log(
      `room is created with id: ${this.roomId} and max playyer = ${this.maxClients}`
    );
    this.setState(new RoomState());
    // chatting
    this.onMessage("chat", (client, data) => {
      console.log(data);
    });
    // sitting
    this.onMessage("sit-down", (client, data) => {
      console.log({ client, data });
    });
  }

  onJoin(client: Client, options: any, user: User) {
    console.log(this.maxClients);
    const player = new Player();
    this.state.players.set(client.sessionId, player);
    console.log(`${user.displayName} has joined!!!!`);
    console.log("new player =>", player.toJSON());
  }

  // async onLeave(client: Client, consented?: boolean | undefined) {
  //   // flag client as inactive for other users
  //   this.state.players.get(client.sessionId).connected = false;

  //   try {
  //     if (consented) throw new Error("consented leave");

  //     // allow disconnected client to reconnect into this room until 20 seconds
  //     await this.allowReconnection(client, 20);

  //     // client returned! let's re-activate it.
  //     this.state.players.get(client.sessionId).connected = true;
  //   } catch (error) {
  //     // 20 seconds expired. let's remove the client.
  //     this.state.players.delete(client.sessionId);
  //   }
  // }
  // onLeave(client: Client, consented: boolean) {
  //   const player = this.state.playerWithClient(client);

  //   if (player.bot) {
  //     const bot: BotClient = this.bots[client.sessionId];

  //     if (bot) {
  //       this.bots.delete(client.sessionId);
  //       bot.dispose();
  //     }
  //   }

  //   // remaining leave actions...
  // }

  // onDispose() {
  //   console.log("room", this.roomId, "disposing...");
  //   this.bots.forEach((bot) => bot.dispose());

  //   this.bots = null;

  //   // remaining dispose actions...
  // }
}
