import { Client, Room } from 'colyseus.js';
import { RoomState } from './schemas/room.schema';
import { Player } from './schemas/player.schema';

export class BotClient {
  readonly client: Client;
  room: Room<RoomState>;
  player: Player;
  sessionId: string;

  constructor(server: string | Client) {
    this.client = server instanceof Client ? server : new Client(server);
  }

  async joinRoom(roomId: string) {
    console.log('roomid:::::', roomId);
    this.room = await this.client.joinById<RoomState>(roomId, { bot: true }, RoomState);
    console.log('bot join');
    this.begin();
  }

  async leave() {
    this.room.leave(true);
  }

  async dispose() {
    // clean up here
  }

  // useful if you want to integrate with loadtest
  attachToRoom(room: Room) {
    this.room = room;
    this.begin();
  }

  private begin() {
    this.sessionId = this.room.sessionId;

    // attach message handlers, e.g...
    this.room.onMessage<string>('ping', message => {
      this.room.send('pong', { message });
    });

    // listen for state changes
  }
}
