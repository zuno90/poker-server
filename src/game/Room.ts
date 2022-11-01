import { Client, Room } from "colyseus";
import { deal } from "./modules/handleCard";
import { Card } from "./schema/card.schema";
import { Player } from "./schema/player.schema";
import { RoomState } from "./schema/room.schema";

interface User {
  id: number;
  email?: string;
  username?: string;
  name: string;
  avatar: string;
}

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;
  // private bots: Map<string, BotClient> | null = new Map<string, BotClient>();

  // async addBot() {
  //   const bot = new BotClient(SERVER_URL);
  //   await bot.joinRoom(this.roomId);
  //   this.bots.set(bot.sessionId, bot);
  // }

  onAuth(client: Client, options: any) {
    console.log(options);
    const { id } = JSON.parse(options);
    console.log(id);
    return { id };
  }

  onCreate(options: any) {
    console.log(
      `room is created with id: ${this.roomId} and max player = ${this.maxClients}`
    );
    this.setState(new RoomState());
    // chatting
    this.onMessage("update-state", (client, data) => {
      console.log(data);
    });
    // chatting
    this.onMessage("chat", (client, data) => {
      console.log({ client, data });
    });
  }

  onJoin(client: Client, options: any, user: User) {
    const hand = deal(3);
    console.log(hand);
    const player = new Player(user);
    const { id, state, cards } = player;
    const c = new Card("A", "co");
    cards.push(c);

    // console.log("max player", this.hasReachedMaxClients());
    // set state of player for ROOM
    this.state.players.set(client.sessionId, player); // set player moi lan join
    this.state.onReady = false;
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId + "leave room...");
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
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
