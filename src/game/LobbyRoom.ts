import { Client, Room } from 'colyseus';
import { Player } from './schemas/player.schema';
import { LOBBY_PRIVATE_CHAT } from './constants/lobby.constant';

interface IMessageData {
  reveiverSessionId: string;
  message: string;
}

export default class LobbyRoom extends Room<any> {
  // public readonly autoDispose = false;

  onCreate(options: any) {
    this.handlePrivateChat();
  }

  onJoin(client: Client, options: string, player: Player) {
    console.log('join');
  }

  onLeave(client: Client, consented: boolean) {
    console.log('leave');
  }

  onDispose() {
    console.log('room ', this.roomId, ' is disposing...');
  }

  // helper
  private handlePrivateChat() {
    this.onMessage(LOBBY_PRIVATE_CHAT, (sender: Client, data: IMessageData) => {
      console.log(`data send to `, data);
      const { reveiverSessionId, message } = data;
      this.clients.forEach((client: Client, index: number) => {
        if (!client)
          return sender.send(LOBBY_PRIVATE_CHAT, 'Receiver is offline, can not send message now!');
        if (client.sessionId === reveiverSessionId) return client.send(LOBBY_PRIVATE_CHAT, message);
      });
    });
  }
}
