import { Client, Room } from "colyseus";
import { RoomState } from "./schema/room.schema";
import { Player } from "./schema/player.schema";
import {
  ROOM_CHAT,
  ROOM_DISPOSE,
  START_GAME,
  FINISH_GAME,
  FOLD,
  CALL,
  CHECK,
  RAISE,
  ALLIN,
} from "./constants/room.constant";
import { deal } from "./modules/handleCard";
import { pickWinner } from "./modules/handleRank";

const Hand = require("pokersolver").Hand;

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;
  private initBetChip: number = 100;

  onAuth(_: Client, player: Player) {
    player.connected = true;
    player.isWinner = false;
    return player;
  }

  onCreate(options: any) {
    // CREATE AN INITIAL ROOM STATE
    this.setState(new RoomState());

    // CHANGE ROOM STATE WHEN ALL USERS GET READY
    this.handleRoomState();

    // HANDLE ROOM CHAT
    this.handleChat();

    // HANDLE ALL ACTION FROM PLAYER
    this.handleFOLD();
    this.handleCALL();
    this.handleCHECK();
    this.handleRAISE();
    this.handleALLIN();
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

  private handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, (_, data) => {
      if (this.clients.length < 1) return false;
      const { onHandCards, banker5Cards } = deal(this.state.players.size);
      this.state.onReady = true; // change room state -> TRUE
      this.state.highestBet = 0; // highestBet = 0 at initial game
      this.state.banker5Cards = banker5Cards; // change cards of banker -> [...]

      let arrWinner: Array<any> = [];
      let arrCardRanks: Array<any> = [];

      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        // init state of player
        playerMap.isWinner = false;
        playerMap.betChips = this.initBetChip;
        playerMap.chips -= this.initBetChip;

        // pick winner
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
          if (v.sessionId === sessionId) playerMap.cardRank = v.name; // v.descr
        });
        arrCardRanks = playerCardRanks;
      });

      // pick winner and set isWinner -> true
      const winner = Hand.winners(arrCardRanks)[0];
      // get winner session
      const winPlayer = <Player>this.state.players.get(winner.sessionId);
      if (!winPlayer) return false;
      winPlayer.isWinner = true;
    });

    // FINISH GAME
    this.onMessage(FINISH_GAME, (_, data) => {});
  }

  // handle chat
  private handleChat() {
    this.onMessage(ROOM_CHAT, (_, data) => {
      console.log(data);
      this.broadcast(ROOM_CHAT, data);
    });
  }

  // handle action - FOLD
  private handleFOLD() {
    if (!this.state.onReady) return false;
    this.onMessage(FOLD, (client: Client, chips: number) => {
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.isWinner = false;
    });
  }
  // handle action - CALL
  private handleCALL() {
    if (!this.state.onReady) return false;
    this.onMessage(CALL, (client: Client, chips: number) => {
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.chips -= chips;
    });
  }

  // handle action - CHECK
  private handleCHECK() {
    if (!this.state.onReady) return false;
    this.onMessage(CHECK, (client: Client, chips: number) => {
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.chips -= chips;
    });
  }

  // handle action - RAISE
  private handleRAISE() {
    if (!this.state.onReady) return false;
    this.onMessage(RAISE, (client: Client, chips: number) => {
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.betChips = chips;
      player.chips -= chips;
      this.state.highestBet <= chips && (this.state.highestBet = chips);
    });
  }

  // handle action - ALL-IN
  private handleALLIN() {
    if (!this.state.onReady) return false;
    this.onMessage(ALLIN, (client: Client, chips: number) => {
      console.log(chips);
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) return false;
      player.chips -= chips;
    });
  }
}
