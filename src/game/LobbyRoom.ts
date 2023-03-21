import { Request } from 'express';
import { Client, Room } from 'colyseus';
import { MapSchema, Schema, type } from '@colyseus/schema';
import {
  LOBBY_CHECK_FRIENDS,
  LOBBY_PRIVATE_CHAT,
  REQUEST_CHAT_FRIEND,
} from './constants/lobby.constant';

interface IMessageData {
  receiverSessionId: string;
  message: string;
}

class PlayerState extends Schema {
  @type('string') _id: string;
  @type('string') displayName: string;
}

class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

export default class LobbyRoom extends Room<RoomState> {
  // public readonly autoDispose = false;

  onAuth(client: Client, options: any, request?: Request) {
    const { _id, username } = options;
    return { _id, displayName: username };
  }

  onCreate(options: any) {
    this.setState(new RoomState());
    this.handleCheckFriendsChat();
    this.handlePrivateChat();
  }

  onJoin(client: Client, options: string, player: PlayerState) {
    this.state.players.set(client.sessionId, new PlayerState(player));
  }

  onLeave(client: Client, consented: boolean) {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId);
    }
  }

  onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
  }

  // helper
  private handleCheckFriendsChat() {
    this.onMessage(LOBBY_CHECK_FRIENDS, (sender: Client, friendIds: string[]) => {
      const onlineFriends: any[] = [];
      this.state.players.forEach((player: PlayerState, sessionId: string) => {
        if (friendIds.includes(player._id)) onlineFriends.push({ s: sessionId, i: player._id });
      });
      sender.send(LOBBY_CHECK_FRIENDS, onlineFriends);
    });
  }

  private handlePrivateChat() {
    this.onMessage(LOBBY_PRIVATE_CHAT, (sender: Client, data: IMessageData) => {
      console.log(`data send to `, data);
      const { receiverSessionId, message } = data;
      this.clients.forEach((client: Client, _) => {
        console.log(client.sessionId, receiverSessionId);
        if (client.sessionId === receiverSessionId) {
          console.log('co neee');
          return client.send(LOBBY_PRIVATE_CHAT, message);
        }
      });
    });
  }
}
