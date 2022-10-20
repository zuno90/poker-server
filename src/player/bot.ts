// import { Client, Room } from "colyseus";
// import { Player, RoomState } from "../schema/room.state";

// export class BotClient {
//   client: Client;
//   room: Room<RoomState>;
//   player: Player;
//   sessionId: string;

//   constructor(server: string | Client) {
//     this.client = server instanceof Client ? server : new Client(server);
//   }

//   dispose() {
//     // clean up here
//   }

//   async joinRoom(roomId: string) {
//     this.room = await this.client.joinById<RoomState>(
//       roomId,
//       { bot: true },
//       RoomState
//     );

//     this.begin();
//   }

//   // useful if you want to integrate with loadtest
//   attachToRoom(room: Room) {
//     this.room = room;
//     this.begin();
//   }

//   leave() {
//     this.room?.leave(true);
//   }

//   private begin() {
//     this.sessionId = this.room.sessionId;

//     // attach message handlers, e.g...
//     this.room.onMessage<string>("ping", (message: any) => {
//       this.room.send("pong", { message });
//     });

//     // listen for state changes
//   }
// }
