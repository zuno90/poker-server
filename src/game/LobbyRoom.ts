import { Request } from 'express';
import { Client, Room } from 'colyseus';
import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';
import {
  CMS_FRIEND_LIST,
  GM_ANNOUNCEMENT,
  LOBBY_CHECK_FRIENDS,
  LOBBY_PRIVATE_CHAT,
  LOBBY_REQUEST_CHAT_FRIEND,
  POKER_FRIEND_LIST,
} from './constants/lobby.constant';

interface IMessageData {
  receiverId: string;
  message: string;
  time: string;
}

class MessageState extends Schema {
  @type('string') message: string;
  @type('number') time: number;
}

class ArrayMessage extends Schema {
  @type([MessageState]) messages = new ArraySchema<MessageState>();
}

class PlayerState extends Schema {
  @type('string') _id: string;
  @type('string') displayName: string;
  @type({ map: ArrayMessage }) in = new MapSchema<ArrayMessage>();
  @type({ map: ArrayMessage }) out = new MapSchema<ArrayMessage>();
  @type('boolean')
  connected: boolean = false;
}

class RoomState extends Schema {
  @type('boolean') ready: boolean = false;
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

export default class CustomLobbyRoom extends Room<RoomState> {
  public readonly autoDispose = false;

  private readonly reconnectTimeOut = 60;

  onAuth(client: Client, options: any, request?: Request) {
    const { _id, username } = options;
    return { _id, displayName: username };
  }

  onCreate(options: any) {
    this.roomId = 'zunohandsome';
    this.setState(new RoomState());
    this.handleAllMessagesFromGM();
    this.handleCheckFriendsChat();
    this.handleReqChat();
    this.handlePrivateChat();
  }

  onJoin(client: Client, options: string, player: PlayerState) {
    player.connected = true;
    this.state.players.set(client.sessionId, new PlayerState(player));
  }

  async onLeave(client: Client, consented: boolean) {
    const player = <PlayerState>this.state.players.get(client.sessionId);
    player.connected = false;
    try {
      if (consented) throw new Error('consented leave');
      // allow disconnected client to reconnect into this room until 20 seconds
      await this.allowReconnection(client, this.reconnectTimeOut);

      // client returned! let's re-activate it.
      player.connected = true;
    } catch (e) {
      // 10 seconds expired. let's remove the client.
      this.state.players.delete(client.sessionId);
    }
  }

  onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
  }

  // GM join
  private handleAllMessagesFromGM() {
    this.presence.subscribe(GM_ANNOUNCEMENT, (data: any) => {
      console.log(data);
      this.broadcast(GM_ANNOUNCEMENT);
      this.presence.unsubscribe(GM_ANNOUNCEMENT);
    });
  }

  // helper
  private handleCheckFriendsChat() {
    this.onMessage(LOBBY_CHECK_FRIENDS, (sender: Client) => {
      const player = <PlayerState>this.state.players.get(sender.sessionId);
      this.presence.publish(POKER_FRIEND_LIST, player._id);
      this.presence.subscribe(`${CMS_FRIEND_LIST}:${player._id}`, (friendList: any[]) => {
        for (let friend of friendList) {
          this.state.players.forEach((player: PlayerState, sessionId) => {
            if (friend._id === player._id) friend.sessionId = sessionId;
          });
        }
        this.presence.unsubscribe('cms:friend:list');
        return sender.send(LOBBY_CHECK_FRIENDS, friendList);
      });
    });
  }

  private handleReqChat() {
    this.onMessage(LOBBY_REQUEST_CHAT_FRIEND, (_sender: Client, receiverId: string) => {
      const sender = <PlayerState>this.state.players.get(_sender.sessionId);
      const messageIn = sender.in.get(receiverId);
      const messageOut = sender.out.get(receiverId);
      _sender.send(LOBBY_REQUEST_CHAT_FRIEND, { messageIn, messageOut });
    });
  }

  private handlePrivateChat() {
    this.onMessage(LOBBY_PRIVATE_CHAT, (_sender: Client, data: IMessageData) => {
      const sMArr = new ArrayMessage();
      const rMArr = new ArrayMessage();
      const sender = <PlayerState>this.state.players.get(_sender.sessionId);
      const { receiverId, message, time } = data;
      const t = new Date(time).getTime();
      const receiver = <PlayerState>this.state.players.get(receiverId);
      if (!receiver) return;

      const newMess = new MessageState({ message, time: t });

      sMArr.messages.push(newMess);
      rMArr.messages.push(newMess);

      if (!sender.out.has(receiverId)) sender.out.set(receiverId, sMArr);
      else sender.out.get(receiverId)?.messages.push(newMess);

      if (!receiver.in.has(_sender.sessionId)) receiver.in.set(_sender.sessionId, rMArr);
      else receiver.in.get(_sender.sessionId)?.messages.push(newMess);

      this.clients.forEach((client: Client, _) => {
        if (client.sessionId === receiverId)
          return client.send(LOBBY_PRIVATE_CHAT, { message, time: t });
      });
    });
  }
}
