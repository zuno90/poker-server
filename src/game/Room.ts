import { Client, Room } from "colyseus";
import { Player, RoomState } from "./RoomState";

interface User {
  id: number;
  email?: string;
  username?: string;
  name: string;
  avatar: string;
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
    const { id, email, username, name, avatar } = JSON.parse(options);
    return { id, email, username, name, avatar };
  }

  onCreate(options: any) {
    try {
      console.log(
        `room is created with id: ${this.roomId} and max player = ${this.maxClients}`
      );
      this.setState(new RoomState());
      // // chatting
      // this.onMessage("chat", (client, data) => {
      //   console.log(data);
      // });
      // // sitting
      // this.onMessage("sit-down", (client, data) => {
      //   console.log({ client, data });
      // });
    } catch (error) {
      console.error(error);
    }
  }

  onJoin(client: Client, options: any, user: User): void | Promise<any> {
    const player = new Player(user);
    this.state.players.set(client.sessionId, player); // set player moi lan join
    console.log(client.sessionId);
    // console.log(`${user.name} has joined!!!!`);
    console.log("new player =>", player.toJSON());
  }

  onLeave(
    client: Client,
    consented?: boolean | undefined
  ): void | Promise<any> {
    console.log(client.sessionId + "leave room...");
  }

  onDispose(): void | Promise<any> {
    console.log("room", this.roomId, "disposing...");
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
