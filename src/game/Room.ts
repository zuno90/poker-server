import { Client, Room } from "colyseus";
import { RoomState } from "./schema/room.schema";
import { Player, ERole, EPlayerAction } from "./schema/player.schema";
import {
  ROOM_CHAT,
  ROOM_DISPOSE,
  START_GAME,
  FINISH_GAME,
} from "./constants/room.constant";
import { deal } from "./modules/handleCard";
import { pickWinner } from "./modules/handleRank";

const Hand = require("pokersolver").Hand;

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;

  onAuth(_: Client, player: Player) {
    player.connected = true;
    player.isWinner = false;
    return player;
  }

  onCreate(options: any) {
    // CREATE AN INITIAL ROOM STATE
    this.setState(new RoomState());

    // HANDLE ROOM CHAT
    this.handleChat();

    // CHANGE ROOM STATE WHEN ALL USERS GET READY
    this.handleRoomState();

    // HANDLE ALL ACTION FROM PLAYER
    this.handlePlayerAction();
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
    this.broadcast(ROOM_DISPOSE, "room bi dispose");
  }

  // handle Bot Client
  // private createBot() {
    // const botPlayer = <Player>{
    //   id: "zuno-bot",
    //   isHost: false,
    //   chips: 10000,
    //   turn: this.clients.length + 1,
    //   role: ERole.Bot,
    //   connected: true,
    //   isWinner: false,
    // };
  //   this.state.players.set(this.botSessionId, new Player(botPlayer));
  // }

  // handle chat
  private handleChat() {
    this.onMessage(ROOM_CHAT, (_, data) => {
      console.log(data);
      this.broadcast(ROOM_CHAT, data);
    });
  }

  // handle Room State
  private handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, (_, data) => {
      // if (this.clients.length < 2) return false;
      // if (this.clients.length < 5) this.createBot(); // create new bot if real player < 5

      console.log("sau khi co bot", this.clients.length);

      const { onHandCards, banker5Cards } = deal(this.clients.length);
      this.state.players.forEach(
        (playerMap: Player, sessionId: string) => (playerMap.isWinner = false)
      );
      this.state.onReady = true; // change room state -> TRUE
      this.state.highestBet = 0; // highestBet = 0 at initial game
      this.state.banker5Cards = banker5Cards; // change cards of banker -> [...]

      let arrWinner: Array<any> = [];
      let arrCardRanks: Array<any> = [];

      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        playerMap.cards = onHandCards[playerMap.turn - 1];
        arrWinner.push({
          sessionId,
          sevenCards: [...playerMap.cards.values()].concat([
            ...banker5Cards.values(),
          ]),
        });

        const playerCardRanks = pickWinner(arrWinner);
        // detail card rank each player
        playerCardRanks.forEach((v, _) => {
          if (v.sessionId === sessionId) playerMap.cardRank = v.descr;
        });
        arrCardRanks = playerCardRanks;
      });

      // pick winner and set isWinner -> true
      const winner = Hand.winners(arrCardRanks)[0];
      // get winner session
      const player = <Player>this.state.players.get(winner.sessionId);
      if (!player) return false;
      player.isWinner = true;
    });

    // FINISH GAME
    this.onMessage(FINISH_GAME, (_, data) => {});
  }

  private handlePlayerAction() {
    // FOLD
    this.onMessage(EPlayerAction.FOLD, (client: Client, chips: number) => {
      if (!this.state.onReady) return false;
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.isFold = true;
      player.isWinner = false;
    });

    // CALL
    this.onMessage(EPlayerAction.CALL, (client: Client, chips: number) => {
      if (!this.state.onReady) return false;
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.chips -= chips;
    });

    // CHECK
    this.onMessage(EPlayerAction.CHECK, (client: Client, chips: number) => {
      if (!this.state.onReady) return false;
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.chips -= chips;
    });

    // RAISE
    this.onMessage(EPlayerAction.RAISE, (client: Client, chips: number) => {
      if (!this.state.onReady) return false;
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.betChips = chips;
      player.chips -= chips;
      this.state.highestBet <= chips && (this.state.highestBet = chips);
    });

    // ALL-IN
    this.onMessage(EPlayerAction.ALLIN, (client: Client, chips: number) => {
      if (!this.state.onReady) return false;
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.chips -= chips;
    });
  }
}
